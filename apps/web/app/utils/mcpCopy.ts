// Shared copy for the MCP / AI assistants feature (consent page and Settings).
export const MCP_DATA_SHARING_NOTICE =
    "Your financial data will be sent to the AI provider behind this app (for example Anthropic for Claude) whenever the assistant uses these tools. You can revoke access anytime in Settings → AI assistants.";

export const MCP_READ_ONLY_PERMISSIONS =
    "Read-only access to your accounts, balances, categories, transactions, budgets and spending reports. It cannot change anything.";

export interface McpSetupGuide {
    name: string;
    url: string;
}

export const MCP_SETUP_GUIDES: readonly McpSetupGuide[] = [
    {
        name: "Claude",
        url: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
    },
    { name: "Claude Code", url: "https://code.claude.com/docs/en/mcp" },
    { name: "ChatGPT", url: "https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt" },
    { name: "Codex", url: "https://developers.openai.com/codex/mcp" },
    { name: "Gemini CLI", url: "https://geminicli.com/docs/tools/mcp-server/" },
];
