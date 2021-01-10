const fs = require("fs");
const acorn = require("acorn");

const sourceCode = String(fs.readFileSync("./main.js"));

console.log(acorn.parse(sourceCode, { sourceType: "module" }));
