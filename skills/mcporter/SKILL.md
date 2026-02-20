---
name: mcporter
description: MCP (Model Context Protocol) server integration and management for Claude Code. Use when the user asks to "connect MCP server", "add MCP tool", "list MCP servers", "configure MCP", or needs to manage MCP server connections.
allowed-tools: Bash, Read, Write, Glob, Grep
---

# MCP Server Integration (mcporter)

Connect to, manage, and use MCP (Model Context Protocol) servers from Claude Code.

## Trigger Phrases

- "MCPサーバーに接続して"
- "MCPツールを追加して"
- "MCP設定を確認"
- "Connect MCP server..."
- "Add MCP tool..."
- "List MCP servers"
- "Configure MCP"

## What is MCP?

Model Context Protocol (MCP) is a standard protocol that allows AI assistants to connect to external tools and data sources. Claude Code can connect to MCP servers to extend its capabilities.

## MCP Configuration

### Configuration File Location

MCP servers are configured in Claude Code's settings:

```
~/.claude/claude_desktop_config.json
```

Or for project-specific configuration:
```
.mcp.json (in project root)
```

### Configuration Format

```json
{
  "mcpServers": {
    "server-name": {
      "command": "command-to-start-server",
      "args": ["arg1", "arg2"],
      "env": {
        "ENV_VAR": "value"
      }
    }
  }
}
```

## Managing MCP Servers

### List Configured Servers

```bash
# Check global MCP config
cat ~/.claude/claude_desktop_config.json 2>/dev/null | python3 -m json.tool

# Check project-level MCP config
cat .mcp.json 2>/dev/null | python3 -m json.tool
```

### Add a New MCP Server

#### Method 1: Using Claude Code CLI

```bash
# Add a stdio MCP server (global scope)
claude mcp add SERVER_NAME -s user -- COMMAND ARG1 ARG2

# Add a stdio MCP server (project scope)
claude mcp add SERVER_NAME -s project -- COMMAND ARG1 ARG2

# Add with environment variables
claude mcp add SERVER_NAME -s user -e API_KEY=xxx -- COMMAND ARG1 ARG2

# Add a server with SSE transport
claude mcp add SERVER_NAME -s user --transport sse -- https://server-url.example.com/mcp
```

#### Method 2: Edit Configuration Directly

Read and edit the configuration file:

```bash
# Read current config
cat ~/.claude/claude_desktop_config.json

# Edit to add new server (use Claude's Write/Edit tools)
```

### Remove an MCP Server

```bash
claude mcp remove SERVER_NAME
```

### List All MCP Servers (CLI)

```bash
claude mcp list
```

## Common MCP Servers

### File System Server

```bash
claude mcp add filesystem -s user -- npx -y @modelcontextprotocol/server-filesystem ~/Documents ~/Projects
```

### GitHub Server

```bash
claude mcp add github -s user -e GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx -- npx -y @modelcontextprotocol/server-github
```

### PostgreSQL Server

```bash
claude mcp add postgres -s user -- npx -y @modelcontextprotocol/server-postgres "postgresql://user:pass@localhost/dbname"
```

### Brave Search Server

```bash
claude mcp add brave-search -s user -e BRAVE_API_KEY=xxx -- npx -y @modelcontextprotocol/server-brave-search
```

### Google Maps Server

```bash
claude mcp add google-maps -s user -e GOOGLE_MAPS_API_KEY=xxx -- npx -y @modelcontextprotocol/server-google-maps
```

### Slack Server

```bash
claude mcp add slack -s user -e SLACK_BOT_TOKEN=xoxb-xxx -e SLACK_TEAM_ID=T0xxx -- npx -y @modelcontextprotocol/server-slack
```

### Memory Server (Persistent Context)

```bash
claude mcp add memory -s user -- npx -y @modelcontextprotocol/server-memory
```

### Puppeteer Server (Browser Automation)

```bash
claude mcp add puppeteer -s user -- npx -y @modelcontextprotocol/server-puppeteer
```

### Custom Python MCP Server

```bash
# Install Python MCP SDK
pip install mcp

# Add custom server
claude mcp add my-server -s project -- python ~/.claude/skills/mcporter/my_server.py
```

## Creating a Custom MCP Server

### Python MCP Server Template

Create a minimal MCP server in `~/.claude/skills/mcporter/my_server.py`:

```python
from mcp.server import Server, stdio_server
from mcp.types import Tool, TextContent

app = Server("my-custom-server")

@app.list_tools()
async def list_tools():
    return [
        Tool(
            name="my_tool",
            description="Description of what this tool does",
            inputSchema={
                "type": "object",
                "properties": {
                    "param1": {"type": "string", "description": "Parameter description"}
                },
                "required": ["param1"]
            }
        )
    ]

@app.call_tool()
async def call_tool(name: str, arguments: dict):
    if name == "my_tool":
        result = f"Processed: {arguments['param1']}"
        return [TextContent(type="text", text=result)]

async def main():
    async with stdio_server() as (read, write):
        await app.run(read, write, app.create_initialization_options())

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
```

### Node.js MCP Server Template

```javascript
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

const server = new Server({ name: "my-server", version: "1.0.0" }, {
  capabilities: { tools: {} }
});

server.setRequestHandler("tools/list", async () => ({
  tools: [{
    name: "my_tool",
    description: "Description",
    inputSchema: { type: "object", properties: { param1: { type: "string" } }, required: ["param1"] }
  }]
}));

server.setRequestHandler("tools/call", async (request) => {
  if (request.params.name === "my_tool") {
    return { content: [{ type: "text", text: `Result: ${request.params.arguments.param1}` }] };
  }
});

const transport = new StdioServerTransport();
server.connect(transport);
```

## Troubleshooting

### Check Server Status

```bash
# View MCP server logs
cat ~/.claude/logs/mcp*.log 2>/dev/null

# Test server manually
echo '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' | COMMAND_TO_START_SERVER
```

### Common Issues

1. **Server not starting**: Check that the command and dependencies are installed
2. **Permission errors**: Ensure env vars and file paths are accessible
3. **Timeout**: Server must respond to initialization within timeout period
4. **Missing tools**: Verify `list_tools` / `tools/list` handler returns tools

## Response Format

```
MCP Server Status:

  Server           | Status  | Tools | Transport
  -----------------|---------|-------|----------
  filesystem       | Active  | 5     | stdio
  github           | Active  | 12    | stdio
  my-custom        | Error   | 0     | stdio

  Total Servers: 3
  Active: 2
  Tools Available: 17
```

## Notes

- MCP servers extend Claude Code's capabilities without modifying core code
- Servers communicate via stdio (stdin/stdout) or SSE (Server-Sent Events)
- Each server runs as a separate process
- Environment variables can contain sensitive data; use env.yaml for management
- Official MCP servers: https://github.com/modelcontextprotocol/servers
- MCP SDK: https://github.com/modelcontextprotocol/sdk
- All platforms supported (Windows, Linux, Mac)
