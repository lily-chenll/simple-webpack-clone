const fs = require("fs");
const path = require("path");

const FILE_EXTENSIONS = [".js", ".ts", "json"];
const FILES = [
  "index.js",
  "main.js",
  "index.ts",
  "main.ts",
  "index.json",
  "main.json",
];

const getFileWithoutExt = (filePath) => {
  for (let i = 0; i < FILE_EXTENSIONS.length; i++) {
    const newFilePath = filePath + FILE_EXTENSIONS[i];
    if (fs.existsSync(newFilePath)) return newFilePath;
  }
  return "";
};

const getFileInFolder = (folderPath) => {
  for (let i = 0; i < FILES.length; i++) {
    const newFilePath = path.join(folderPath, FILES[i]);
    if (fs.existsSync(newFilePath)) return newFilePath;
  }
  return "";
};

const getFileInNodeModuleFolder = (folderPath) => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(folderPath, "package.json"))
  );
  const entryFile = packageJson.main;
  return path.join(folderPath, entryFile);
};

const getFilePath = (filePath) => {
  // file with extension
  if (path.extname(filePath)) return filePath;

  // check whether it's file without extension
  const fileWithoutExt = getFileWithoutExt(filePath);
  if (fileWithoutExt) return fileWithoutExt;

  // check whether it's a folder (except for node_modules folder)
  if (fs.existsSync(filePath)) {
    const fileInFolder = getFileInFolder(filePath);
    if (fileInFolder) return fileInFolder;
  }
  // check whether it's a folder under node_modules
  const folderName = path.basename(filePath);
  let newFolderPath = filePath;
  let folderPath = path.resolve(newFolderPath, folderName);
  let upwardFolderLevel = 1;
  while (!fs.existsSync(newFolderPath) || !fs.existsSync(folderPath)) {
    if (newFolderPath === "/node_modules")
      throw new Error("File doesn't exist");
    const relativePath = "../".repeat(upwardFolderLevel) + "node_modules";
    newFolderPath = path.resolve(filePath, relativePath);
    folderPath = path.resolve(newFolderPath, folderName);
    upwardFolderLevel++;
  }

  return getFileInNodeModuleFolder(folderPath);
};

getFileAbsolutePath = (relativePath, basicPath) => {
  const absolutePath = path.resolve(path.dirname(basicPath), relativePath);
  return getFilePath(absolutePath);
};

module.exports = getFileAbsolutePath;
