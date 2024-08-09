/**
 * Trailing comments are only assigned to the code that is on the same line as themselves.
 * Leading comments that are block quotes are assigned to the code that is directly below them.
 */
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
// const types = require('@babel/types');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { SourceMapGenerator } = require('source-map');
const sourceCodeDir = './samples/comment-loc';
const outputCodeDir = './samples/comment-loc';
const readmeFilePath = './README.md';
const sourceMapFilePath = './README.map.json';
let collectedComments = [];
let commentLocations = [];
class FileProcessor {
  constructor(sourceDir, outputDir) {
    this.sourceDir = sourceDir;
    this.outputDir = outputDir;
  }

  processFile(filePath) {
    const code = fs.readFileSync(filePath, 'utf-8');
    const ast = parser.parse(code, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'typescript'],
      attachComment: true,
    });

    ast.comments.forEach((comment) => {
      comment._docmapId = uuidv4();
    });

    // TO DEBUG AST
    // const astJson = JSON.stringify(ast, null, 2);
    // const astJsonFilePath = filePath + '.ast.json';
    // fs.writeFileSync(astJsonFilePath, astJson);

    ast.comments = ast.comments.filter((comment) => {
      const isTargetComment = comment.value.includes('#DOCMAP_v0.0.1:');
      if (isTargetComment) {
        /**
         * Extracts all content following the #DOCMAP_v0.0.1: tag and removes any leading asterisks. 
         * It first isolates the content after the specified tag, then splits it into individual lines for processing. 
         * Each line is cleaned by removing any leading asterisks (*) and spaces. Finally, the cleaned lines are 
         * rejoined, with newline characters preserved, to maintain the original formatting.
         */

        const cleanedComment = comment.value
          .substring(
            comment.value.indexOf('#DOCMAP_v0.0.1:') + '#DOCMAP_v0.0.1:'.length
          )
          .split('\n') // Split by newline to process each line
          .map((line) => line.replace(/^ \* /, '')) // Remove leading asterisk and spaces for each line
          .join('\n') // Rejoin the lines with newline characters preserved
          .trim();

        collectedComments.push({
          docmapId: comment._docmapId,
          text: cleanedComment,
        });
      }
      return !isTargetComment;
    });

    const visitor = {
      Program(path) {
        path.traverse({
          enter(nodePath) {
            if (nodePath.node.leadingComments) {
              nodePath.node.leadingComments =
                nodePath.node.leadingComments.filter((comment) => {
                  if (
                    comment.type === 'CommentBlock' &&
                    comment.value.includes('#DOCMAP_v0.0.1:')
                  ) {
                    const location = nodePath.node.loc.start;
                    // const locationString = `Line: ${location.line}, Column: ${location.column}`;
                    commentLocations.push({
                      docmapId: comment._docmapId,
                      filePath,
                      loc: location,
                    });
                    return false;
                  }
                  return true;
                });
            }
            if (nodePath.node.trailingComments) {
              nodePath.node.trailingComments =
                nodePath.node.trailingComments.filter((comment) => {
                  if (comment.value.includes('#DOCMAP_v0.0.1:')) {
                    const location = nodePath.node.loc.start;
                    const endLine = nodePath.node.loc.end.line;
                    if (comment.loc.start.line === endLine) {
                      // const locationString = `Line: ${location.line}, Column: ${location.column}`;
                      commentLocations.push({
                        docmapId: comment._docmapId,
                        filePath,
                        loc: location,
                      });
                      return false;
                    }
                  }
                  return true;
                });
            }
          },
        });
      },
    };

    traverse(ast, visitor);

    const { code: modifiedCode } = generate(ast, {}, code);
    this.writeOutputFile(filePath, modifiedCode);
  }

  traverseDirectory(dir) {
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
      const filePath = path.join(dir, file);
      if (file === 'node_modules') {
        return;
      }
      if (fs.statSync(filePath).isDirectory()) {
        this.traverseDirectory(filePath);
      } else if (
        path.extname(filePath) === '.jsx' ||
        path.extname(filePath) === '.tsx' ||
        path.extname(filePath) === '.js' ||
        path.extname(filePath) === '.ts'
      ) {
        this.processFile(filePath);
      }
    });
  }

  writeOutputFile(filePath, modifiedCode) {
    const outputFilePath = path.join(
      this.outputDir,
      path.relative(this.sourceDir, filePath)
    );

    const outputDirPath = path.dirname(outputFilePath);
    this.ensureDirectoryExists(outputDirPath);

    fs.writeFileSync(outputFilePath, modifiedCode);
    console.log(`Processed: ${filePath}`);
  }

  ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  writeCollectedComments(readmeFilePath) {
    const commentsContent = collectedComments
      .map((item) => item.text)
      .join('\n\n');
    fs.writeFileSync(readmeFilePath, commentsContent);
    console.log(`Comments written to ${readmeFilePath}`);
  }

  generateSourceMap(sourceMapFilePath) {
    const map = new SourceMapGenerator({ file: readmeFilePath });

    let line = 1;
    collectedComments.forEach((comment) => {
      const location = commentLocations.find(
        (loc) => loc.docmapId === comment.docmapId
      );
      if (location) {
        const lines = comment.text.split('\n');
        lines.forEach((_, i) => {
          map.addMapping({
            generated: { line: line + 2*i, column: 0 },
            source: location.filePath,
            original: { line: location.loc.line, column: 0 },
            name: null,
          });
        });
        line += lines.length + 1; // +1 for the blank line between comments
        const sourceContent = fs.readFileSync('./samples/comment-loc/c.tsx', 'utf-8');
        map.setSourceContent(location.filePath, sourceContent);
      }
    });

    fs.writeFileSync(sourceMapFilePath, map.toString());
    console.log(`Source map written to ${sourceMapFilePath}`);
  }
}

const fileProcessor = new FileProcessor(sourceCodeDir, outputCodeDir);
fileProcessor.traverseDirectory(sourceCodeDir);
fileProcessor.writeCollectedComments(readmeFilePath);
fileProcessor.generateSourceMap(sourceMapFilePath);
