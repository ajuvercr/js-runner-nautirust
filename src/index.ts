import { AllReaderFactory, AllWriterFactory, Config as CConfig } from "@treecg/connector-all";
import { Deserializers, Serializers, Configs } from "@treecg/connector-types";
import { readFile } from "fs/promises";
import * as jsonld from "jsonld";
import path = require("node:path");

import * as N3 from "n3";
type PlainArgument = {
    type: "Plain",
    value: any,
}

type FileArgument = {
    type: "File",
    path: string,
    serialization: string,
}

type ChannelConfig = {
    type: string,
    serialization: string,
    config: CConfig,
}

type StreamReaderArgument = {
    type: "StreamReader",
    fields: { [id: string]: ChannelConfig },
}

type StreamWriterArgument = {
    type: "StreamWriter",
    fields: { [id: string]: ChannelConfig },
}

type ProcessorConfig = {
    config: {
        jsFile: string,
        methodName: string,
    },
    location?: string,
    args: { id: string, type: string }[]
}

type Argument = FileArgument | PlainArgument | StreamWriterArgument | StreamReaderArgument;


type Config = {
    processorConfig: ProcessorConfig,
    args: { [id: string]: Argument },
}

function getDeserializer(type: string): (member: string) => Promise<unknown> | unknown {
    let ser: string | undefined;
    if (type.toLocaleLowerCase().includes("turtle")) ser = "text/turtle";
    if (type.toLocaleLowerCase().includes("trig")) ser = "TriG";
    if (type.toLocaleLowerCase().includes("n-triples")) ser = "N-Triples";
    if (type.toLocaleLowerCase().includes("n-quads")) ser = "N-Quads";
    if (type.toLocaleLowerCase().includes("n3")) ser = "N3";
    if (type.toLocaleLowerCase().includes("notation3")) ser = "Notation3";
    if (!!ser) {
        return (member) => {
            const parser = new N3.Parser({ format: ser });
            try {
                return parser.parse(member);
            } catch (e) {
                console.error(e);
            }
        };
    }

    switch (type) {
        case "application/json":
        case "json":
            return JSON.parse;
        case "jsonld":
            return async (json) => await jsonld.toRDF(JSON.parse(json));
        case "plain":
            return (x) => x;
        case "xml":
            return x => new DOMParser().parseFromString(x, "text/xml");
        default:
            throw "Unknown serialization " + type;
    }
}

function getSerializer(type: string): (member: unknown) => string | Promise<string> {
    let ser: string | undefined;
    if (type.toLocaleLowerCase().includes("turtle")) ser = "text/turtle";
    if (type.toLocaleLowerCase().includes("trig")) ser = "TriG";
    if (type.toLocaleLowerCase().includes("n-triples")) ser = "N-Triples";
    if (type.toLocaleLowerCase().includes("n-quads")) ser = "N-Quads";
    if (type.toLocaleLowerCase().includes("n3")) ser = "N3";
    if (type.toLocaleLowerCase().includes("notation3")) ser = "Notation3";
    if (!!ser) {
        return (member) => {
            const parser = new N3.Writer({ format: ser });
            return parser.quadsToString(<N3.Quad[]>member);
        };
    }

    switch (type.toLocaleLowerCase()) {
        case "application/json":
        case "json":
            return JSON.stringify;
        case "jsonld":
            return async (qs) => JSON.stringify(await <Promise<Object>>jsonld.fromRDF(<object>qs, { "format": undefined }));
        case "plain":
            return (x) => <string>x;
        case "xml":
            return (x) => new XMLSerializer().serializeToString(x instanceof Document ? x.getRootNode() : <Node>x);
        default:
            throw "Unknown serialization " + type;
    }
}

function calculateDeserializers(configs: { [id: string]: ChannelConfig }): { [label: string]: Deserializers<unknown> } {
    const out: { [label: string]: Deserializers<unknown> } = {};
    for (let key of Object.keys(configs)) {
        out[key] = getDeserializer(configs[key].serialization);
    }

    return out;
}

function calculateSerializers(configs: { [id: string]: ChannelConfig }): { [label: string]: Serializers<unknown> } {
    const out: { [label: string]: Serializers<unknown> } = {};

    for (let key of Object(configs).keys()) {
        out[key] = getSerializer(configs[key].serialization);
    }

    return out;
}

function get_config_location() {
    const args = process.argv.slice(2);
    process.chdir(args[1] || "./");
    return args[0];
}

async function main() {
    const config_location = get_config_location();
    const content = await readFile(config_location);
    const { args, processorConfig }: Config = JSON.parse(content.toString());

    const readerFactory = new AllReaderFactory();
    const writerFactory = new AllWriterFactory();

    // TODO validate config, we write decent program!

    const arg_values: any[] = await Promise.all(processorConfig.args.map(a => args[a.id]).map(
        async arg => {
            switch (arg.type) {
                case "StreamReader":
                    const deserializers = calculateDeserializers(arg.fields);
                    const readerConfigs = <Configs<unknown, Config>>arg.fields;
                    return await readerFactory.buildReader(readerConfigs, deserializers);
                case "StreamWriter":
                    const serializers = calculateSerializers(arg.fields);
                    const writerConfigs = <Configs<unknown, Config>>arg.fields;
                    return await writerFactory.buildReader(writerConfigs, serializers);
                case "File":
                    const deserializer = getDeserializer(arg.serialization);
                    const content = await readFile(arg.path, { encoding: "utf8" });
                    return deserializer(content);
                case "Plain":
                    return arg.value;
            }
        }
    ));

    await launchFunction(processorConfig, arg_values);
}

async function launchFunction(processorConfig: ProcessorConfig, arg_values: any[]) {
    if (processorConfig.location) process.chdir(processorConfig.location)

    const root = path.join(processorConfig.location || process.cwd(), processorConfig.config.jsFile);
    const jsProgram = require(root);

    jsProgram[processorConfig.config.methodName](...arg_values);
}

main()

