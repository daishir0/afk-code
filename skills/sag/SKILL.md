---
name: sag
description: Sub-agent execution framework for spawning parallel Claude Code agents using the Task tool. Use when the user asks to "run in parallel", "spawn sub-agents", "multi-task", "delegate tasks", or needs concurrent task execution patterns.
allowed-tools: Bash, Read, Write, Glob, Grep, WebFetch, WebSearch
---

# Sub-Agent Execution Framework (sag)

Spawn and manage sub-agents for parallel task execution using Claude Code's Task tool.

## Trigger Phrases

- "並列で実行して" / "サブエージェントで処理して"
- "タスクを分割して並列処理"
- "Run these tasks in parallel"
- "Spawn sub-agents for..."
- "Delegate these tasks"
- "Multi-agent execution"

## Concept

The `sag` (Sub-Agent) framework provides patterns for:
1. **Parallel Execution** - Run multiple independent tasks simultaneously
2. **Task Decomposition** - Break complex tasks into sub-tasks
3. **Fan-out/Fan-in** - Distribute work and collect results
4. **Pipeline** - Chain tasks sequentially with data passing

## Core Pattern: Task Tool Usage

Claude Code's Task tool spawns sub-agents that can use specified tools. Each sub-agent runs independently and returns results.

### Basic Sub-Agent Call

```
Task tool call:
  description: "Clear description of what this sub-agent should do"
  prompt: "Detailed instructions for the sub-agent"
```

The sub-agent receives its own set of allowed tools and operates independently.

## Execution Patterns

### Pattern 1: Parallel Independent Tasks

When tasks have no dependencies, spawn them simultaneously.

**Example: Analyze multiple files in parallel**

Spawn multiple Task calls in the same response:

```
Task 1: "Analyze the Python files in /src/module_a/ for code quality issues"
Task 2: "Analyze the Python files in /src/module_b/ for code quality issues"
Task 3: "Analyze the Python files in /src/module_c/ for code quality issues"
```

After all complete, synthesize results into a unified report.

### Pattern 2: Fan-out / Fan-in

Distribute work to sub-agents, then aggregate results.

**Example: Multi-source research**

```
Phase 1 (Fan-out) - Spawn simultaneously:
  Task A: "Search WebSearch for 'topic X latest developments 2026' and summarize findings"
  Task B: "Search WebSearch for 'topic X market analysis' and summarize findings"
  Task C: "Read and analyze the local files in ./data/topic_x/ and summarize"

Phase 2 (Fan-in) - After all complete:
  Combine findings from Tasks A, B, C into a comprehensive report
```

### Pattern 3: Pipeline (Sequential Chain)

Each stage passes results to the next.

**Example: Content creation pipeline**

```
Stage 1: Task "Research the topic 'X' using WebSearch. Output key findings as bullet points."
  -> Results stored

Stage 2: Task "Given these findings: [Stage 1 results], write a draft article outline."
  -> Results stored

Stage 3: Task "Given this outline: [Stage 2 results], write the full article."
  -> Final output
```

### Pattern 4: Map-Reduce

Apply the same operation to multiple items, then reduce.

**Example: Analyze multiple repositories**

```
Map Phase - Spawn for each repo:
  Task 1: "Clone and analyze repo A: count files, identify languages, summarize README"
  Task 2: "Clone and analyze repo B: count files, identify languages, summarize README"
  Task 3: "Clone and analyze repo C: count files, identify languages, summarize README"

Reduce Phase:
  Combine all analysis results into a comparison table
```

### Pattern 5: Worker Pool

For many similar small tasks, batch them into worker groups.

**Example: Process 100 URLs**

```
Worker 1: "Process URLs 1-25 from the list: [urls]. For each, fetch and extract title."
Worker 2: "Process URLs 26-50 from the list: [urls]. For each, fetch and extract title."
Worker 3: "Process URLs 51-75 from the list: [urls]. For each, fetch and extract title."
Worker 4: "Process URLs 76-100 from the list: [urls]. For each, fetch and extract title."
```

## Best Practices

### Task Description Guidelines

1. **Be specific**: Clear description of what the sub-agent should accomplish
2. **Provide context**: Include all necessary information in the prompt
3. **Define output format**: Specify how results should be formatted
4. **Set boundaries**: Tell the agent what NOT to do (e.g., "Do not modify files")

### Good Task Prompt Template

```
Task description: "[ACTION] [TARGET] and [OUTPUT_FORMAT]"

Prompt: """
You are a sub-agent responsible for [specific task].

Input:
- [Data or context the agent needs]

Instructions:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Output format:
- Return results as [format description]
- Include [specific fields]

Constraints:
- Do not [limitation]
- Focus only on [scope]
"""
```

### When to Use Sub-Agents

**Good candidates:**
- Independent research tasks
- File analysis across multiple directories
- Data processing of separate datasets
- Multi-source information gathering
- Repetitive operations on different inputs

**Not recommended:**
- Tasks that require shared state
- Operations that must be strictly sequential
- Very small tasks (overhead not worth it)
- Tasks requiring user interaction

## Error Handling

When a sub-agent fails:
1. Check the error message in the returned result
2. Retry the failed task with adjusted parameters
3. If persistent, fall back to sequential execution
4. Report partial results to the user

## Output Collection

```
Sub-Agent Results Summary:

Task 1 [Research]: Completed
  - Found 15 relevant articles
  - Key finding: [summary]

Task 2 [Analysis]: Completed
  - Analyzed 3 codebases
  - Key finding: [summary]

Task 3 [Data Processing]: Failed (timeout)
  - Retrying with smaller batch...

Overall Progress: 2/3 tasks completed
```

## Integration with Other Skills

Sub-agents can invoke other skills within their tasks:

```
Task: "Use the 'visualize' skill to create a chart from this data: [data].
       Save the output to ./outputs/chart.svg"

Task: "Use the 'blogwatcher' skill to check these RSS feeds: [feeds].
       Summarize any new posts from the last 24 hours."
```

## Notes

- Sub-agents share the same file system but run independently
- Each sub-agent has its own tool permissions based on Task configuration
- Results are text-based; for complex data, use files as intermediary
- Be mindful of rate limits when multiple agents make API calls
- Sub-agents cannot interact with the user directly
- All platforms supported (Windows, Linux, Mac)
