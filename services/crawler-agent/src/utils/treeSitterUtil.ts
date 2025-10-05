/**
 * Tree-sitter Utility Module
 * Provides multi-language AST parsing capabilities
 */

import Parser from 'tree-sitter';
import Java from 'tree-sitter-java';
import Python from 'tree-sitter-python';
import TypeScript from 'tree-sitter-typescript';
import JavaScript from 'tree-sitter-javascript';
import Go from 'tree-sitter-go';
import Rust from 'tree-sitter-rust';
import CSharp from 'tree-sitter-c-sharp';
import { logger } from './logger.js';

export type SupportedLanguage = 'java' | 'python' | 'typescript' | 'javascript' | 'go' | 'rust' | 'csharp';

export interface TreeSitterNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: TreeSitterNode[];
}

export interface ParseResult {
  tree: Parser.Tree;
  rootNode: Parser.SyntaxNode;
  language: SupportedLanguage;
}

export interface QueryMatch {
  pattern: number;
  captures: Array<{
    name: string;
    node: Parser.SyntaxNode;
    text: string;
  }>;
}

/**
 * Language-specific parsers map
 */
const languageParsers: Record<SupportedLanguage, any> = {
  java: Java,
  python: Python,
  typescript: TypeScript.typescript,
  javascript: JavaScript,
  go: Go,
  rust: Rust,
  csharp: CSharp,
};

/**
 * Tree-sitter query patterns for different languages
 */
export const QueryPatterns = {
  // Java patterns
  java: {
    entities: `
      (class_declaration
        (modifiers
          (marker_annotation
            name: (identifier) @annotation
            (#match? @annotation "Entity")))
        name: (identifier) @entity_name
        body: (class_body) @entity_body)
    `,
    services: `
      (class_declaration
        (modifiers
          (marker_annotation
            name: (identifier) @annotation
            (#match? @annotation "Service|Component|RestController")))
        name: (identifier) @service_name
        body: (class_body) @service_body)
    `,
    methods: `
      (method_declaration
        (modifiers) @modifiers
        name: (identifier) @method_name
        parameters: (formal_parameters) @params
        type: (_) @return_type)
    `,
    fields: `
      (field_declaration
        type: (_) @field_type
        declarator: (variable_declarator
          name: (identifier) @field_name))
    `,
    annotations: `
      (marker_annotation
        name: (identifier) @annotation_name)
      (annotation
        name: (identifier) @annotation_name
        arguments: (annotation_argument_list)? @args)
    `,
    imports: `
      (import_declaration
        (scoped_identifier) @import_path)
    `,
    methodCalls: `
      (method_invocation
        object: (identifier)? @object
        name: (identifier) @method_name
        arguments: (argument_list) @args)
    `,
  },

  // Python patterns
  python: {
    classes: `
      (class_definition
        name: (identifier) @class_name
        superclasses: (argument_list)? @bases
        body: (block) @class_body)
    `,
    functions: `
      (function_definition
        name: (identifier) @function_name
        parameters: (parameters) @params
        return_type: (type)? @return_type
        body: (block) @function_body)
    `,
    decorators: `
      (decorator
        (identifier) @decorator_name
        (argument_list)? @args)
    `,
    imports: `
      (import_statement
        name: (dotted_name) @import_path)
      (import_from_statement
        module_name: (dotted_name) @module_name
        name: (dotted_name) @import_name)
    `,
  },

  // TypeScript/JavaScript patterns
  typescript: {
    interfaces: `
      (interface_declaration
        name: (type_identifier) @interface_name
        body: (object_type) @properties)
    `,
    classes: `
      (class_declaration
        name: (type_identifier) @class_name
        body: (class_body) @class_body)
    `,
    functions: `
      (function_declaration
        name: (identifier) @function_name
        parameters: (formal_parameters) @params
        return_type: (type_annotation)? @return_type
        body: (statement_block) @function_body)
    `,
    methods: `
      (method_definition
        name: (property_identifier) @method_name
        parameters: (formal_parameters) @params
        body: (statement_block) @method_body)
    `,
    exports: `
      (export_statement
        declaration: (_) @export_decl)
    `,
    imports: `
      (import_statement
        source: (string) @import_path)
    `,
  },

  // Go patterns
  go: {
    structs: `
      (type_declaration
        (type_spec
          name: (type_identifier) @struct_name
          type: (struct_type) @struct_body))
    `,
    functions: `
      (function_declaration
        name: (identifier) @function_name
        parameters: (parameter_list) @params
        result: (_)? @return_type
        body: (block) @function_body)
    `,
    methods: `
      (method_declaration
        receiver: (parameter_list) @receiver
        name: (field_identifier) @method_name
        parameters: (parameter_list) @params
        result: (_)? @return_type
        body: (block) @method_body)
    `,
  },

  // Rust patterns
  rust: {
    structs: `
      (struct_item
        name: (type_identifier) @struct_name
        body: (field_declaration_list)? @fields)
    `,
    impls: `
      (impl_item
        type: (type_identifier) @type_name
        body: (declaration_list) @impl_body)
    `,
    functions: `
      (function_item
        name: (identifier) @function_name
        parameters: (parameters) @params
        return_type: (type)? @return_type
        body: (block) @function_body)
    `,
  },
};

/**
 * Tree-sitter Parser Manager
 */
export class TreeSitterParser {
  private parsers: Map<SupportedLanguage, Parser> = new Map();

  constructor() {
    this.initializeParsers();
  }

  /**
   * Initialize parsers for all supported languages
   */
  private initializeParsers(): void {
    for (const [lang, langModule] of Object.entries(languageParsers)) {
      try {
        const parser = new Parser();
        parser.setLanguage(langModule);
        this.parsers.set(lang as SupportedLanguage, parser);
        logger.debug(`Initialized Tree-sitter parser for ${lang}`);
      } catch (error) {
        logger.error(`Failed to initialize parser for ${lang}:`, error);
      }
    }
  }

  /**
   * Parse source code for a given language
   */
  parse(sourceCode: string, language: SupportedLanguage): ParseResult | null {
    const parser = this.parsers.get(language);
    if (!parser) {
      logger.error(`No parser available for language: ${language}`);
      return null;
    }

    try {
      const tree = parser.parse(sourceCode);
      return {
        tree,
        rootNode: tree.rootNode,
        language,
      };
    } catch (error) {
      logger.error(`Failed to parse ${language} code:`, error);
      return null;
    }
  }

  /**
   * Execute a query on parsed code
   */
  query(parseResult: ParseResult, queryString: string): QueryMatch[] {
    try {
      const { language, rootNode } = parseResult;
      const parser = this.parsers.get(language);
      if (!parser) return [];

      const query = parser.getLanguage().query(queryString);
      const matches = query.matches(rootNode);

      return matches.map((match) => ({
        pattern: match.pattern,
        captures: match.captures.map((capture) => ({
          name: capture.name,
          node: capture.node,
          text: capture.node.text,
        })),
      }));
    } catch (error) {
      logger.error('Query execution failed:', error);
      return [];
    }
  }

  /**
   * Find all nodes matching a specific type
   */
  findNodesByType(rootNode: Parser.SyntaxNode, nodeType: string): Parser.SyntaxNode[] {
    const results: Parser.SyntaxNode[] = [];

    const traverse = (node: Parser.SyntaxNode) => {
      if (node.type === nodeType) {
        results.push(node);
      }
      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(rootNode);
    return results;
  }

  /**
   * Extract text for a node with line numbers
   */
  getNodeText(node: Parser.SyntaxNode): string {
    return node.text;
  }

  /**
   * Get node position information
   */
  getNodePosition(node: Parser.SyntaxNode) {
    return {
      startLine: node.startPosition.row + 1,
      startColumn: node.startPosition.column,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column,
    };
  }

  /**
   * Extract all class names from Java code
   */
  extractJavaClasses(sourceCode: string): Array<{ name: string; type: string; annotations: string[] }> {
    const parseResult = this.parse(sourceCode, 'java');
    if (!parseResult) return [];

    const classes: Array<{ name: string; type: string; annotations: string[] }> = [];

    // Find all class declarations
    const classNodes = this.findNodesByType(parseResult.rootNode, 'class_declaration');

    for (const classNode of classNodes) {
      const nameNode = classNode.childForFieldName('name');
      if (!nameNode) continue;

      const className = nameNode.text;
      const annotations: string[] = [];

      // Extract annotations
      const modifiersNode = classNode.childForFieldName('modifiers');
      if (modifiersNode) {
        const annotationNodes = this.findNodesByType(modifiersNode, 'marker_annotation');
        annotations.push(...annotationNodes.map((n) => n.text));

        const normalAnnotations = this.findNodesByType(modifiersNode, 'annotation');
        annotations.push(...normalAnnotations.map((n) => n.text));
      }

      classes.push({
        name: className,
        type: 'class',
        annotations,
      });
    }

    return classes;
  }

  /**
   * Extract method signatures from any supported language
   */
  extractMethods(sourceCode: string, language: SupportedLanguage): Array<{
    name: string;
    parameters: string[];
    returnType?: string;
    line: number;
  }> {
    const parseResult = this.parse(sourceCode, language);
    if (!parseResult) return [];

    const methods: Array<{ name: string; parameters: string[]; returnType?: string; line: number }> = [];

    let methodNodeType: string;
    switch (language) {
      case 'java':
        methodNodeType = 'method_declaration';
        break;
      case 'python':
        methodNodeType = 'function_definition';
        break;
      case 'typescript':
      case 'javascript':
        methodNodeType = 'function_declaration';
        break;
      case 'go':
        methodNodeType = 'function_declaration';
        break;
      case 'rust':
        methodNodeType = 'function_item';
        break;
      default:
        return methods;
    }

    const methodNodes = this.findNodesByType(parseResult.rootNode, methodNodeType);

    for (const methodNode of methodNodes) {
      const nameNode = methodNode.childForFieldName('name');
      if (!nameNode) continue;

      const methodName = nameNode.text;
      const parameters: string[] = [];

      // Extract parameters
      const paramsNode = methodNode.childForFieldName('parameters');
      if (paramsNode) {
        parameters.push(paramsNode.text);
      }

      // Extract return type
      const returnTypeNode = methodNode.childForFieldName('type') || methodNode.childForFieldName('return_type');
      const returnType = returnTypeNode?.text;

      methods.push({
        name: methodName,
        parameters,
        returnType,
        line: methodNode.startPosition.row + 1,
      });
    }

    return methods;
  }
}

/**
 * Singleton instance
 */
export const treeSitterParser = new TreeSitterParser();

