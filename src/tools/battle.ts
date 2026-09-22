import { z } from 'zod';
import { parse, GameNum } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { notFound } from '../lib/errors.js';

/**
 * Read-mostly inspection tool, matching the granularity of physics.ts
 * (raycast/overlap queries rather than owning a live physics world).
 * @emptysock/battle's BattleSystem public surface (start/submitAction/subscribe)
 * is a stateful turn machine meant to be driven live inside a running game —
 * this server has no live engine connection to attach to. Instead of
 * re-implementing a full round simulator (and risking drift from
 * BattleSystem's real turn order / status-effect resolution), this tool
 * exposes the one pure, stateless calculation an agent needs for balance
 * testing: BattleSystem's default physical damage formula, `DEFAULT_PHYSICAL`
 * in BattleSystem.ts —
 * `max(1, floor((effectiveAttack - effectiveDefense / 2) * power * (isCrit ? critMultiplier : 1)))`.
 */
const EstimateDamageSchema = z.object({
  effectiveAttack: GameNum.nonnegative(),
  effectiveDefense: GameNum.nonnegative(),
  power: GameNum.positive().default(1),
  critChance: z.number().min(0).max(1).default(0.0625),
  critMultiplier: GameNum.positive().default(1.5),
});

function physicalDamage(
  effectiveAttack: number,
  effectiveDefense: number,
  power: number,
  isCrit: boolean,
  critMultiplier: number,
): number {
  return Math.max(
    1,
    Math.floor((effectiveAttack - effectiveDefense / 2) * power * (isCrit ? critMultiplier : 1)),
  );
}

export const battleToolDefs = [
  {
    name: 'battle_estimate_damage',
    description:
      "Compute normal/critical/expected damage for BattleSystem's default physical formula, given effective attack/defense (after status multipliers), a skill power multiplier, crit chance, and crit multiplier. Read-only — does not touch a live BattleSystem instance. Useful for testing combat balance without running a battle.",
    inputSchema: {
      type: 'object',
      properties: {
        effectiveAttack: { type: 'number', minimum: 0, description: "Attacker's attack stat after status multipliers" },
        effectiveDefense: { type: 'number', minimum: 0, description: "Target's defense stat after status multipliers" },
        power: { type: 'number', description: 'Skill/attack power multiplier. Default 1 (a plain attack).' },
        critChance: { type: 'number', minimum: 0, maximum: 1, description: 'Default 0.0625, matching BattleSystemOptions.critChance.' },
        critMultiplier: { type: 'number', description: 'Default 1.5, matching BattleSystemOptions.critMultiplier.' },
      },
      required: ['effectiveAttack', 'effectiveDefense'],
    },
  },
] as const;

export async function battleHandler(toolName: string, raw: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    case 'battle_estimate_damage': {
      const parsed = parse(EstimateDamageSchema, raw);
      const power = parsed.power ?? 1;
      const critChance = parsed.critChance ?? 0.0625;
      const critMultiplier = parsed.critMultiplier ?? 1.5;
      const normalDamage = physicalDamage(parsed.effectiveAttack, parsed.effectiveDefense, power, false, critMultiplier);
      const critDamage = physicalDamage(parsed.effectiveAttack, parsed.effectiveDefense, power, true, critMultiplier);
      const expectedDamage = normalDamage * (1 - critChance) + critDamage * critChance;
      return textResponse({ normalDamage, critDamage, expectedDamage, critChance, critMultiplier });
    }
    default:
      throw notFound(toolName);
  }
}
