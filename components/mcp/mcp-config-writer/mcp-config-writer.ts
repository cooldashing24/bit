import fs from 'fs-extra';
import path from 'path';
import { homedir } from 'os';

/**
 * Options for setting up MCP server configuration
 */
export interface SetupOptions {
  consumerProject?: boolean;
  includeAdditional?: string;
  isGlobal: boolean;
  workspaceDir?: string;
}

/**
 * Options for writing rules/instructions files
 */
export interface RulesOptions {
  isGlobal: boolean;
  workspaceDir?: string;
  consumerProject?: boolean;
}

/**
 * MCP Configuration Writer - A utility component for writing MCP server configurations
 * and rules files for various editors (VS Code, Cursor, Windsurf, Roo Code, Cline, Claude Code).
 *
 * This component can be used by various aspects including the CLI MCP server and the init command.
 */
export class McpConfigWriter {
  /**
   * Build MCP server arguments based on provided options
   */
  static buildMcpServerArgs(options: SetupOptions): string[] {
    const { consumerProject, includeAdditional } = options;
    const args = ['mcp-server', 'start'];

    if (consumerProject) {
      args.push('--consumer-project');
    }

    if (includeAdditional) {
      args.push('--include-additional', includeAdditional);
    }

    return args;
  }

  /**
   * Read and parse a JSON file, returning empty object if file doesn't exist
   */
  static async readJsonFile(filePath: string): Promise<any> {
    if (!(await fs.pathExists(filePath))) {
      return {};
    }

    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse ${path.basename(filePath)}: ${(error as Error).message}`);
    }
  }

  /**
   * Get display name for an editor
   */
  static getEditorDisplayName(editor: string): string {
    switch (editor) {
      case 'vscode':
        return 'VS Code';
      case 'cursor':
        return 'Cursor';
      case 'windsurf':
        return 'Windsurf';
      case 'roo':
        return 'Roo Code';
      case 'cline':
        return 'Cline';
      case 'claude-code':
        return 'Claude Code';
      default:
        return editor;
    }
  }

  /**
   * Get VS Code settings.json path based on global/workspace scope
   */
  static getVSCodeSettingsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global VS Code settings
      const platform = process.platform;
      switch (platform) {
        case 'win32':
          return path.join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'settings.json');
        case 'darwin':
          return path.join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json');
        case 'linux':
          return path.join(homedir(), '.config', 'Code', 'User', 'settings.json');
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
    } else {
      // Workspace-specific settings
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.vscode', 'settings.json');
    }
  }

  /**
   * Get VS Code mcp.json path for workspace configuration
   */
  static getVSCodeMcpConfigPath(workspaceDir?: string): string {
    const targetDir = workspaceDir || process.cwd();
    return path.join(targetDir, '.vscode', 'mcp.json');
  }

  /**
   * Setup VS Code MCP integration
   */
  static async setupVSCode(options: SetupOptions): Promise<void> {
    const { isGlobal, workspaceDir } = options;

    if (isGlobal) {
      // For global configuration, use settings.json with mcp.servers structure
      const settingsPath = this.getVSCodeSettingsPath(isGlobal, workspaceDir);

      // Ensure directory exists
      await fs.ensureDir(path.dirname(settingsPath));

      // Read existing settings or create empty object
      const settings = await this.readJsonFile(settingsPath);

      // Build MCP server args
      const args = this.buildMcpServerArgs(options);

      // Create or update MCP configuration
      if (!settings.mcp) {
        settings.mcp = {};
      }

      if (!settings.mcp.servers) {
        settings.mcp.servers = {};
      }

      settings.mcp.servers['bit-cli'] = {
        type: 'stdio',
        command: 'bit',
        args: args,
      };

      // Write updated settings
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    } else {
      // For workspace configuration, use .vscode/mcp.json with direct servers structure
      const mcpConfigPath = this.getVSCodeMcpConfigPath(workspaceDir);

      // Ensure directory exists
      await fs.ensureDir(path.dirname(mcpConfigPath));

      // Read existing MCP configuration or create empty object
      const mcpConfig = await this.readJsonFile(mcpConfigPath);

      // Build MCP server args
      const args = this.buildMcpServerArgs(options);

      // Create or update MCP configuration
      if (!mcpConfig.servers) {
        mcpConfig.servers = {};
      }

      mcpConfig.servers['bit-cli'] = {
        type: 'stdio',
        command: 'bit',
        args: args,
      };

      // Write updated MCP configuration
      await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    }
  }

  /**
   * Get Cursor mcp.json path based on global/workspace scope
   */
  static getCursorSettingsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global Cursor MCP configuration
      return path.join(homedir(), '.cursor', 'mcp.json');
    } else {
      // Workspace-specific MCP configuration
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.cursor', 'mcp.json');
    }
  }

  /**
   * Setup Cursor MCP integration
   */
  static async setupCursor(options: SetupOptions): Promise<void> {
    const { isGlobal, workspaceDir } = options;

    // Determine mcp.json path
    const mcpConfigPath = this.getCursorSettingsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(mcpConfigPath));

    // Read existing MCP configuration or create empty object
    const mcpConfig = await this.readJsonFile(mcpConfigPath);

    // Build MCP server args
    const args = this.buildMcpServerArgs(options);

    // Create or update MCP configuration for Cursor
    if (!mcpConfig.mcpServers) {
      mcpConfig.mcpServers = {};
    }

    mcpConfig.mcpServers.bit = {
      type: 'stdio',
      command: 'bit',
      args: args,
    };

    // Write updated MCP configuration
    await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
  }

  /**
   * Get Windsurf mcp.json path based on global/workspace scope
   */
  static getWindsurfSettingsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global Windsurf MCP configuration
      return path.join(homedir(), '.windsurf', 'mcp.json');
    } else {
      // Workspace-specific MCP configuration
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.windsurf', 'mcp.json');
    }
  }

  /**
   * Setup Windsurf MCP integration
   */
  static async setupWindsurf(options: SetupOptions): Promise<void> {
    const { isGlobal, workspaceDir } = options;

    // Determine mcp.json path
    const mcpConfigPath = this.getWindsurfSettingsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(mcpConfigPath));

    // Read existing MCP configuration or create empty object
    const mcpConfig = await this.readJsonFile(mcpConfigPath);

    // Build MCP server args
    const args = this.buildMcpServerArgs(options);

    // Create or update MCP configuration for Windsurf
    if (!mcpConfig.mcpServers) {
      mcpConfig.mcpServers = {};
    }

    mcpConfig.mcpServers.bit = {
      type: 'stdio',
      command: 'bit',
      args: args,
    };

    // Write updated MCP configuration
    await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
  }

  /**
   * Get Roo Code mcp.json path based on global/workspace scope
   */
  static getRooCodeSettingsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Roo Code doesn't support global configuration, show warning
      throw new Error(
        'Roo Code global configuration is not supported as it uses VS Code internal storage that cannot be accessed. Please use workspace-specific configuration instead.'
      );
    } else {
      // Workspace-specific MCP configuration
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.roo', 'mcp.json');
    }
  }

  /**
   * Setup Roo Code MCP integration
   */
  static async setupRooCode(options: SetupOptions): Promise<void> {
    const { isGlobal, workspaceDir } = options;

    if (isGlobal) {
      throw new Error(
        'Roo Code global configuration is not supported as it uses VS Code internal storage that cannot be accessed. Please use workspace-specific configuration instead.'
      );
    }

    // Determine mcp.json path
    const mcpConfigPath = this.getRooCodeSettingsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(mcpConfigPath));

    // Read existing MCP configuration or create empty object
    const mcpConfig = await this.readJsonFile(mcpConfigPath);

    // Build MCP server args
    const args = this.buildMcpServerArgs(options);

    // Create or update MCP configuration for Roo Code
    if (!mcpConfig.mcpServers) {
      mcpConfig.mcpServers = {};
    }

    mcpConfig.mcpServers.bit = {
      type: 'stdio',
      command: 'bit',
      args: args,
    };

    // Write updated MCP configuration
    await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
  }

  /**
   * Get Claude Code mcp.json path based on global/workspace scope
   */
  static getClaudeCodeSettingsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global Claude Code MCP configuration
      const platform = process.platform;
      switch (platform) {
        case 'win32':
          return path.join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
        case 'darwin':
          return path.join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        case 'linux':
          return path.join(homedir(), '.config', 'claude', 'claude_desktop_config.json');
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
    } else {
      // Workspace-specific MCP configuration
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.mcp.json');
    }
  }

  /**
   * Setup Claude Code MCP integration
   */
  static async setupClaudeCode(options: SetupOptions): Promise<void> {
    const { isGlobal, workspaceDir } = options;

    // Determine mcp.json path
    const mcpConfigPath = this.getClaudeCodeSettingsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(mcpConfigPath));

    // Read existing MCP configuration or create empty object
    const mcpConfig = await this.readJsonFile(mcpConfigPath);

    // Build MCP server args
    const args = this.buildMcpServerArgs(options);

    // Create or update MCP configuration for Claude Code
    if (!mcpConfig.mcpServers) {
      mcpConfig.mcpServers = {};
    }

    mcpConfig.mcpServers.bit = {
      command: 'bit',
      args: args,
    };

    // Write updated MCP configuration
    await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
  }

  /**
   * Get VS Code prompts path based on global/workspace scope
   */
  static getVSCodePromptsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global VS Code prompts - use the official User Data prompts directory
      const platform = process.platform;
      switch (platform) {
        case 'win32':
          return path.join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'prompts', 'bit.instructions.md');
        case 'darwin':
          return path.join(
            homedir(),
            'Library',
            'Application Support',
            'Code',
            'User',
            'prompts',
            'bit.instructions.md'
          );
        case 'linux':
          return path.join(homedir(), '.config', 'Code', 'User', 'prompts', 'bit.instructions.md');
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
    } else {
      // Workspace-specific prompts
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.github', 'instructions', 'bit.instructions.md');
    }
  }

  /**
   * Get Cursor prompts path based on global/workspace scope
   */
  static getCursorPromptsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      throw new Error('Cursor does not support global prompts configuration in a file');
    } else {
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.cursor', 'rules', 'bit.rules.mdc');
    }
  }

  /**
   * Get Roo Code prompts path based on global/workspace scope
   */
  static getRooCodePromptsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global Roo Code rules
      return path.join(homedir(), '.roo', 'rules', 'bit.instructions.md');
    } else {
      // Workspace-specific rules
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.roo', 'rules', 'bit.instructions.md');
    }
  }

  /**
   * Get Cline prompts path based on global/workspace scope
   */
  static getClinePromptsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global Cline rules - using Mac path as specified, error for others
      const platform = process.platform;
      if (platform === 'darwin') {
        return path.join(homedir(), 'Documents', 'Cline', 'Rules', 'bit.instructions.md');
      } else {
        throw new Error(
          `Global Cline rules configuration is not supported on ${platform}. ` +
            'The global path is only known for macOS (~/Documents/Cline/Rules/). ' +
            'For other operating systems, please use the --print flag to get the rules content ' +
            'and add it manually to your global Cline configuration.'
        );
      }
    } else {
      // Workspace-specific rules
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.clinerules', 'bit.instructions.md');
    }
  }

  /**
   * Get Claude Code prompts path based on global/workspace scope
   */
  static getClaudeCodePromptsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global Claude Code rules - using .claude directory
      return path.join(homedir(), '.claude', 'bit.md');
    } else {
      // Workspace-specific rules in .claude directory
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.claude', 'bit.md');
    }
  }

  /**
   * Get default Bit MCP rules content from template file
   */
  static async getDefaultRulesContent(consumerProject: boolean = false): Promise<string> {
    const templateName = consumerProject ? 'bit-rules-consumer-template.md' : 'bit-rules-template.md';
    const templatePath = path.join(__dirname, templateName);
    return fs.readFile(templatePath, 'utf8');
  }

  /**
   * Write Bit MCP rules file for VS Code
   */
  static async writeVSCodeRules(options: RulesOptions): Promise<void> {
    const { isGlobal, workspaceDir, consumerProject = false } = options;

    // Determine prompts file path
    const promptsPath = this.getVSCodePromptsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(promptsPath));

    // Write rules content
    const rulesContent = await this.getDefaultRulesContent(consumerProject);
    await fs.writeFile(promptsPath, rulesContent);
  }

  /**
   * Write Bit MCP rules file for Cursor
   */
  static async writeCursorRules(options: RulesOptions): Promise<void> {
    const { isGlobal, workspaceDir, consumerProject = false } = options;

    // Determine prompts file path
    const promptsPath = this.getCursorPromptsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(promptsPath));

    // Write rules content
    const rulesContent = await this.getDefaultRulesContent(consumerProject);
    await fs.writeFile(promptsPath, rulesContent);
  }

  /**
   * Write Bit MCP rules file for Roo Code
   */
  static async writeRooCodeRules(options: RulesOptions): Promise<void> {
    const { isGlobal, workspaceDir, consumerProject = false } = options;

    // Determine prompts file path
    const promptsPath = this.getRooCodePromptsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(promptsPath));

    // Write rules content
    const rulesContent = await this.getDefaultRulesContent(consumerProject);
    await fs.writeFile(promptsPath, rulesContent);
  }

  /**
   * Write Bit MCP rules file for Cline
   */
  static async writeClineRules(options: RulesOptions): Promise<void> {
    const { isGlobal, workspaceDir, consumerProject = false } = options;

    // Determine prompts file path
    const promptsPath = this.getClinePromptsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(promptsPath));

    // Write rules content
    const rulesContent = await this.getDefaultRulesContent(consumerProject);
    await fs.writeFile(promptsPath, rulesContent);
  }

  /**
   * Write Bit MCP rules file for Claude Code
   */
  static async writeClaudeCodeRules(options: RulesOptions): Promise<void> {
    const { isGlobal, workspaceDir, consumerProject = false } = options;

    // Determine prompts file path
    const promptsPath = this.getClaudeCodePromptsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(promptsPath));

    // Get base rules content
    const rulesContent = await this.getDefaultRulesContent(consumerProject);

    // Add integration instructions at the top
    const integrationInstructions = `<!--
To use these Bit instructions, add the following to your main CLAUDE.md file:

@.claude/bit.md

This will automatically include all Bit-specific instructions in your Claude Code context.
-->

`;

    const finalContent = integrationInstructions + rulesContent;

    // Write rules content with integration instructions
    await fs.writeFile(promptsPath, finalContent);
  }

  /**
   * Setup MCP server configuration for a specific editor
   */
  static async setupEditor(editor: string, options: SetupOptions): Promise<void> {
    const supportedEditors = ['vscode', 'cursor', 'windsurf', 'roo', 'cline', 'claude-code'];
    const editorLower = editor.toLowerCase();

    if (!supportedEditors.includes(editorLower)) {
      throw new Error(`Editor "${editor}" is not supported yet. Currently supported: ${supportedEditors.join(', ')}`);
    }

    if (editorLower === 'vscode') {
      await this.setupVSCode(options);
    } else if (editorLower === 'cursor') {
      await this.setupCursor(options);
    } else if (editorLower === 'windsurf') {
      await this.setupWindsurf(options);
    } else if (editorLower === 'roo') {
      await this.setupRooCode(options);
    } else if (editorLower === 'cline') {
      // Cline doesn't need MCP server setup, only rules files
      // This is a no-op but we include it for consistency
      // Users should use the 'rules' command to set up Cline instructions
    } else if (editorLower === 'claude-code') {
      await this.setupClaudeCode(options);
    }
  }

  /**
   * Write rules file for a specific editor
   */
  static async writeRulesFile(editor: string, options: RulesOptions): Promise<void> {
    const supportedEditors = ['vscode', 'cursor', 'roo', 'cline', 'claude-code'];
    const editorLower = editor.toLowerCase();

    if (!supportedEditors.includes(editorLower)) {
      throw new Error(`Editor "${editor}" is not supported yet. Currently supported: ${supportedEditors.join(', ')}`);
    }

    if (editorLower === 'vscode') {
      await this.writeVSCodeRules(options);
    } else if (editorLower === 'cursor') {
      await this.writeCursorRules(options);
    } else if (editorLower === 'roo') {
      await this.writeRooCodeRules(options);
    } else if (editorLower === 'cline') {
      await this.writeClineRules(options);
    } else if (editorLower === 'claude-code') {
      await this.writeClaudeCodeRules(options);
    }
  }

  /**
   * Get the path to the editor config file based on editor type and scope
   */
  static getEditorConfigPath(editor: string, isGlobal: boolean, workspaceDir?: string): string {
    const editorLower = editor.toLowerCase();

    if (editorLower === 'vscode') {
      // For VS Code, return appropriate config path based on global vs workspace scope
      return isGlobal ? this.getVSCodeSettingsPath(isGlobal, workspaceDir) : this.getVSCodeMcpConfigPath(workspaceDir);
    } else if (editorLower === 'cursor') {
      return this.getCursorSettingsPath(isGlobal, workspaceDir);
    } else if (editorLower === 'windsurf') {
      return this.getWindsurfSettingsPath(isGlobal, workspaceDir);
    } else if (editorLower === 'roo') {
      return this.getRooCodeSettingsPath(isGlobal, workspaceDir);
    } else if (editorLower === 'cline') {
      return this.getClinePromptsPath(isGlobal, workspaceDir);
    } else if (editorLower === 'claude-code') {
      return this.getClaudeCodeSettingsPath(isGlobal, workspaceDir);
    }

    throw new Error(`Editor "${editor}" is not supported yet.`);
  }
}
