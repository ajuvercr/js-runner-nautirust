
async function main() {
    const fs = require('fs/promises');

    const args = process.argv.slice(2);
    const config_location = args[0];


    const loc = (args[1] || process.cwd()) + "/";
    process.chdir(args[1] || "./");

    const content = JSON.parse(await fs.readFile(config_location));
    const id = content.processorConfig.id.replace(/[^a-zA-Z]/gi, '').toLowerCase();

    const location = content.processorConfig.location.replace(loc, "");;
    console.error("id", id);
    console.error("loc", loc);
    console.error("location", location);

    const dockerContent = [];
    const addDocker = (line) => dockerContent.push(line);
    const writeDocker = async () => {
        await fs.writeFile(`${location}/${id}.dockerfile`, dockerContent.join("\n"));
    };

    const newContent = JSON.parse(JSON.stringify(content));
    newContent.processorConfig.location = "/step";

    addDocker("FROM js-runner:latest");
    addDocker("WORKDIR /step");
    addDocker("COPY . .");

    addDocker("RUN npm install");
    addDocker("RUN npm run build");
    addDocker("");
    addDocker("RUN yarn install --production");
    addDocker("");
    addDocker(`RUN echo '${JSON.stringify(newContent)}' > /config.json`);

    await writeDocker();
    
    console.log(`    ${id}:`)
    console.log(`      network_mode: host`);
    console.log(`      build:`);
    console.log(`        context: ./${location}`);
    console.log(`        dockerfile: ./${id}.dockerfile`);
    console.log(`      volumes:`);
    console.log(`      - ./data:/data`);
    console.log();
}

main();

