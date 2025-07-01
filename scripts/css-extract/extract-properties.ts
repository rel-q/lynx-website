import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import glob from 'fast-glob';
import matter from 'gray-matter';
import { definitionSyntax } from 'css-tree';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DOCS_GLOB = path.resolve(__dirname, '../../docs/en/api/css/properties/*.mdx');
const OUTPUT_PATH = path.resolve(__dirname, './css-properties.json');
const OUTPUT_PROPERTIES_LIST_KEBAB = path.resolve(__dirname, './css-properties-list-kebab.ts');
const OUTPUT_PROPERTIES_LIST_CAMEL = path.resolve(__dirname, './css-properties-list-camel.ts');


// Helper function to convert kebab-case to camelCase
function kebabToCamel(str: string): string {
  return str.replace(
    /-([a-z])/g,
    (_: string, letter: string) => letter.toUpperCase(),
  );
}

interface CSSPropertyDefinition {
  propertyName: string;
  formalSyntax: string;
  parsedSyntax?: any; // CSS-tree AST
  parseError?: string;
  isValid: boolean;
}

function parseFormalSyntax(syntax: string): { parsedSyntax?: any; parseError?: string; isValid: boolean } {
  try {
    const parsed = definitionSyntax.parse(syntax);
    return {
      parsedSyntax: parsed,
      isValid: true
    };
  } catch (error) {
    return {
      parseError: error instanceof Error ? error.message : String(error),
      isValid: false
    };
  }
}

function cleanFormalSyntax(raw: string, propertyName: string): string {
  // Remove CSS-style comments and normalize whitespace
  let cleaned = raw.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  
  // Handle various property declaration formats
  const patterns = [
    // Match "property = value" or "property: value" patterns
    new RegExp(`^${propertyName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\s*[:=]\\s*([\\s\\S]*)$`, 'im'),
    // Match generic "word = value" or "word: value" patterns
    /^[\w-]+\s*[:=]\s*([\s\S]*)$/m,
    // Match lines that end with semicolons (CSS declarations)
    /^[\w-]+\s*:\s*(.*?);?\s*$/m
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      cleaned = match[1].trim();
      break;
    }
  }

  // Remove trailing semicolons and normalize line breaks
  cleaned = cleaned
    .replace(/;\s*$/, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

async function extractFormalSyntax(content: string, currentFilePath: string, propertyName: string): Promise<string | null> {
  // Find "Formal Syntax" heading (case insensitive, flexible spacing)
  const headingRegex = /#{2,3}\s+formal\s+syntax\s*/i;
  const headingMatch = headingRegex.exec(content);
  if (!headingMatch) return null;

  const startIndex = headingMatch.index + headingMatch[0].length;
  const afterHeading = content.slice(startIndex);

  // Strategy 1: Extract from code blocks
  const codeBlockMatch = afterHeading.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const syntax = cleanFormalSyntax(codeBlockMatch[1], propertyName);
    if (syntax) return syntax;
  }

  // Strategy 2: Extract content until next heading or empty section
  const lines = afterHeading.split('\n');
  const syntaxLines: string[] = [];
  let foundContent = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Stop at next heading
    if (/^#{2,3}\s/.test(line)) break;
    
    // Skip empty lines at the beginning
    if (!trimmedLine && !foundContent) continue;
    
    // Stop at multiple consecutive empty lines (end of section)
    if (!trimmedLine && foundContent) {
      const nextNonEmptyIndex = lines.indexOf(line) + 1;
      const hasMoreContent = lines.slice(nextNonEmptyIndex).some(l => l.trim() && !/^#{2,3}\s/.test(l));
      if (!hasMoreContent) break;
    }
    
    if (trimmedLine) {
      syntaxLines.push(trimmedLine);
      foundContent = true;
    }
  }

  if (syntaxLines.length === 0) return null;

  const fallbackText = cleanFormalSyntax(syntaxLines.join('\n'), propertyName);
  
  // Strategy 3: Handle property references like "[left](./left)"
  const refMatch = fallbackText.match(/\[[\w-]+\]\(\.\/([\w-]+)\)/);
  if (refMatch) {
    const referencedFile = path.resolve(path.dirname(currentFilePath), `${refMatch[1]}.mdx`);
    try {
      const referencedContent = await fs.readFile(referencedFile, 'utf8');
      const { content: refContent } = matter(referencedContent);
      return await extractFormalSyntax(refContent, referencedFile, refMatch[1]);
    } catch {
      console.warn(`⚠️  Failed to read referenced property: ${referencedFile}`);
    }
  }

  return fallbackText || null;
}

async function main() {
  const result: CSSPropertyDefinition[] = [];
  const propertyList: string[] = [];

  const files = await glob(DOCS_GLOB);
  
  let validCount = 0;
  let invalidCount = 0;

  console.log(`📁 Processing ${files.length} MDX files...`);

  for (const file of files) {
    const rawContent = await fs.readFile(file, 'utf8');
    const { content } = matter(rawContent);
    
    const propertyName = path.basename(file, '.mdx');

    propertyList.push(propertyName);

    const formalSyntax = await extractFormalSyntax(content, file, propertyName);

    if (formalSyntax) {
      const parseResult = parseFormalSyntax(formalSyntax);
      
      const entry: CSSPropertyDefinition = {
        propertyName,
        formalSyntax,
        ...parseResult
      };
      
      result.push(entry);
      
      if (parseResult.isValid) {
        validCount++;
      } else {
        invalidCount++;
        console.warn(`⚠️  Invalid syntax for ${propertyName}: ${parseResult.parseError}`);
      }
    } else {
      console.warn(`⚠️  No formal syntax found for: ${propertyName}`);
    }
  }

  const propertyListCamel = propertyList.map(d => kebabToCamel(d));
  const code = `export const properties = [\n${
    propertyListCamel.map((p) => `  '${p}'`).join(',\n')
  }\n];\n`;

  await fs.writeFile(OUTPUT_PROPERTIES_LIST_KEBAB, JSON.stringify(propertyList, null, 2), 'utf-8');
  await fs.writeFile(OUTPUT_PROPERTIES_LIST_CAMEL, code, 'utf-8');
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf8');
  console.log(`✅ Successfully extracted ${result.length} CSS properties to ${OUTPUT_PATH}`);
  console.log(`📊 Valid: ${validCount}, Invalid: ${invalidCount}, Missing: ${files.length - result.length}`);
}

main().catch((err) => {
  console.error('❌ Extraction failed:', err);
  process.exit(1);
});