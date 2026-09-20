import { z } from 'zod';
import { parse } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { notFound } from '../lib/errors.js';

/**
 * Read-mostly inspection tool, matching the granularity of physics.ts and
 * battle.ts (pure/stateless checks rather than owning a live interpreter).
 * VisualScriptComponent's execution (update/fireEvent) is meant to run
 * inside a live entity with a real VariableStore/ActorSystem attached; this
 * server has no live engine connection to attach to. Instead, this tool
 * performs the structural validation an agent needs before handing a graph
 * to a game: every node id is unique, every `next` / connection target
 * resolves to a node that exists in the graph, every node is reachable from
 * an entry node (onUpdate or onEvent), and branch nodes have a false-branch
 * warning surfaced when only a true branch is wired.
 *
 * Mirrors VSNode / VisualScriptGraph from
 * @emptysock/engine's VisualScriptComponent.ts.
 */
const VSNodeKindSchema = z.enum([
  'onUpdate',
  'onEvent',
  'sequence',
  'branch',
  'getVariable',
  'setVariable',
  'getSwitch',
  'setSwitch',
  'sendMessage',
]);

const VSNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: VSNodeKindSchema,
    next: z.array(z.string()),
    eventType: z.string().optional(),
    variableIndex: z.number().int().optional(),
    comparator: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte']).optional(),
    // setVariable.value is number | { fromKey }; setSwitch.value is boolean. Union of both since this schema isn't discriminated per-kind.
    value: z.union([z.number(), z.boolean(), z.object({ fromKey: z.string() })]).optional(),
    outputKey: z.string().optional(),
    switchIndex: z.number().int().optional(),
    targetActorId: z.string().optional(),
    messageType: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const VSConnectionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  fromPort: z.number().int().nonnegative().optional(),
});

const VisualScriptGraphSchema = z.object({
  nodes: z.array(VSNodeSchema),
  connections: z.array(VSConnectionSchema),
});

const ValidateGraphSchema = z.object({
  graph: VisualScriptGraphSchema,
});

interface ValidationIssue {
  severity: 'error' | 'warning';
  nodeId?: string;
  message: string;
}

export const visualscriptToolDefs = [
  {
    name: 'visualscript_validate',
    description:
      'Statically validate a VisualScriptGraph (the node graph VisualScriptComponent interprets): duplicate node ids, dangling next/connection targets, unreachable nodes, and branch nodes missing a false-branch. Read-only — does not run the graph against a live VariableStore or ActorSystem.',
    inputSchema: {
      type: 'object',
      properties: {
        graph: {
          type: 'object',
          properties: {
            nodes: { type: 'array', items: { type: 'object' } },
            connections: { type: 'array', items: { type: 'object' } },
          },
          required: ['nodes', 'connections'],
        },
      },
      required: ['graph'],
    },
  },
] as const;

export async function visualscriptHandler(
  toolName: string,
  raw: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    case 'visualscript_validate': {
      const { graph } = parse(ValidateGraphSchema, raw);
      const issues: ValidationIssue[] = [];
      const nodeIds = new Set<string>();
      const duplicateIds = new Set<string>();

      for (const node of graph.nodes) {
        if (nodeIds.has(node.id)) {
          duplicateIds.add(node.id);
        }
        nodeIds.add(node.id);
      }
      for (const id of duplicateIds) {
        issues.push({ severity: 'error', nodeId: id, message: `Duplicate node id "${id}"` });
      }

      for (const node of graph.nodes) {
        node.next.forEach((targetId, port) => {
          if (targetId !== '' && !nodeIds.has(targetId)) {
            issues.push({
              severity: 'error',
              nodeId: node.id,
              message: `next[${port}] references unknown node id "${targetId}"`,
            });
          }
        });
        if (node.kind === 'branch' && node.next[1] === undefined) {
          issues.push({
            severity: 'warning',
            nodeId: node.id,
            message: 'branch node has no false-branch (next[1]) wired — the false path is a no-op',
          });
        }
      }

      for (const conn of graph.connections) {
        if (!nodeIds.has(conn.from)) {
          issues.push({ severity: 'error', nodeId: conn.id, message: `connection "${conn.id}" references unknown source node "${conn.from}"` });
        }
        if (!nodeIds.has(conn.to)) {
          issues.push({ severity: 'error', nodeId: conn.id, message: `connection "${conn.id}" references unknown target node "${conn.to}"` });
        }
      }

      const entryNodeIds = graph.nodes
        .filter((n) => n.kind === 'onUpdate' || n.kind === 'onEvent')
        .map((n) => n.id);

      const reachable = new Set<string>();
      const queue: string[] = [...entryNodeIds];
      while (queue.length > 0) {
        const id = queue.shift();
        if (id === undefined || reachable.has(id)) continue;
        reachable.add(id);
        const node = graph.nodes.find((n) => n.id === id);
        if (node === undefined) continue;
        for (const nextId of node.next) {
          if (nextId !== '' && !reachable.has(nextId)) queue.push(nextId);
        }
      }

      const unreachableNodeIds = graph.nodes
        .map((n) => n.id)
        .filter((id) => !reachable.has(id) && !entryNodeIds.includes(id));
      for (const id of unreachableNodeIds) {
        issues.push({ severity: 'warning', nodeId: id, message: `node "${id}" is not reachable from any onUpdate/onEvent entry node` });
      }

      if (entryNodeIds.length === 0) {
        issues.push({ severity: 'warning', message: 'graph has no onUpdate or onEvent entry node — it will never execute' });
      }

      const valid = issues.every((i) => i.severity !== 'error');
      return textResponse({
        valid,
        nodeCount: graph.nodes.length,
        connectionCount: graph.connections.length,
        entryNodeIds,
        unreachableNodeIds,
        issues,
      });
    }
    default:
      throw notFound(toolName);
  }
}
