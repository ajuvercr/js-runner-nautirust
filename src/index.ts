import { AllReaderFactory, AllWriterFactory } from "@treecg/connector-all";
import { Deserializers, Serializers } from "@treecg/connector-types";
import { match } from "assert";
import { readFile } from "fs/promises";
import path = require("node:path");

import * as N3 from "n3";

type ProcessorConfig = {
    config: {
        jsFile: string,
        methodName: string,
    },
    location?: string,
    args: { id: string, type: string }[]
}

type Config = {
    processorConfig: ProcessorConfig,
    args: any,
}

function squashConfig(configs: any[]): { [label: string]: any } {
    const out: { [label: string]: any } = {};
    configs.forEach(config => out[config.id] = config);
    return out;
}

function getDeserializer(type: string): (member: string) => unknown {
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
            return parser.parse(member);
        };
    }

    switch (type) {
        case "application/json":
        case "json":
            return JSON.parse;
        default:
            throw "Unknown serialization " + type;
    }
}

function getSerializer(type: string): (member: N3.Quad[]) => string {
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
            return parser.quadsToString(member);
        };
    }

    switch (type) {
        case "application/json":
        case "json":
            return JSON.stringify;
        default:
            throw "Unknown serialization " + type;
    }
}

function calculateDeserializers(configs: any[]): { [label: string]: Deserializers<unknown> } {
    const out: { [label: string]: Deserializers<unknown> } = {};

    configs.forEach(config => out[config.id] = getDeserializer(config.serialization));

    return out;
}

function calculateSerializers(configs: any[]): { [label: string]: Serializers<unknown> } {
    const out: { [label: string]: Serializers<unknown> } = {};

    configs.forEach(config => out[config.id] = getSerializer(config.serialization));

    return out;
}

async function main() {
    const args = process.argv.slice(2);
    const config_location = args[0];

    const content = await readFile(config_location);
    const config: Config = JSON.parse(content.toString());


    const readerFactory = new AllReaderFactory();
    const writerFactory = new AllWriterFactory();

    // TODO validate config, we write decent program!

    const streamReaderIds = config.processorConfig.args
        .filter(arg => arg.type.toLowerCase() === "streamreader")
        .map(arg => arg.id);

    const streamWriterIds = config.processorConfig.args
        .filter(arg => arg.type.toLowerCase() === "streamwriter")
        .map(arg => arg.id);

    const srPromise = Promise.all(streamReaderIds.map(async id => {
        const readerConfig = squashConfig(config.args[id]);
        const deserializers = calculateDeserializers(config.args[id]);
        const reader = await readerFactory.buildReader(<any>readerConfig, <any>deserializers);
        config.args[id] = reader;
    }));

    const swPromise = Promise.all(streamWriterIds.map(async id => {
        const writerConfig = squashConfig(config.args[id]);
        const serializers = calculateSerializers(config.args[id]);
        const writer = await writerFactory.buildReader(<any>writerConfig, <any>serializers);
        config.args[id] = writer;
    }));

    await Promise.all([srPromise, swPromise]);

    await launchFunction(config.processorConfig, config.args);
}

async function launchFunction(processorConfig: ProcessorConfig, argDict: any) {
    if (processorConfig.location) process.chdir(processorConfig.location)

    const root = path.join(processorConfig.location || process.cwd(), processorConfig.config.jsFile);
    const jsProgram = require(root);
    const args = processorConfig.args.map(arg => argDict[arg.id]);

    jsProgram[processorConfig.config.methodName](...args);
}

main()

