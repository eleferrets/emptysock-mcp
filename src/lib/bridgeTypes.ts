/**
 * Wire-protocol types for the live bridge (`lib/bridge.ts`).
 *
 * These mirror `EngineQuery`/`EngineQueryResult`/`EngineQueryRequest`/
 * `EngineQueryResponse` from `packages/engine/src/bridge/QueryChannel.ts` in
 * the `emptysock-engine` repo byte-for-byte in shape. They are hand-mirrored
 * here rather than imported from a real `@emptysock/engine` package
 * dependency: that package is `private: true`, lives in a pnpm workspace
 * monorepo with native/WASM dependencies (Rapier, pixi.js, yoga-layout) and
 * is not published to any registry this server can install from, so adding
 * it as a real dependency would mean vendoring and building the entire
 * engine package just to get a handful of type declarations. If
 * `@emptysock/engine` is ever published (or this server moves into the
 * engine's own workspace), replace this file with
 * `import type { EngineQuery, EngineQueryResult, ... } from "@emptysock/engine"`
 * and delete it — do not let the two shapes drift in the meantime; any
 * change to `QueryChannel`'s query/result shapes must be mirrored here too.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface ListEntitiesQuery {
  kind: 'listEntities';
}

export interface EntityInfoQuery {
  kind: 'entityInfo';
  entityId: number;
}

export interface GetComponentQuery {
  kind: 'getComponent';
  entityId: number;
  component: string;
}

export interface SetComponentQuery {
  kind: 'setComponent';
  entityId: number;
  component: string;
  patch: Record<string, unknown>;
}

export interface Raycast2DQuery {
  kind: 'raycast2d';
  origin: Vec2;
  direction: Vec2;
  maxToi?: number;
  solid?: boolean;
}

export interface OverlapCircle2DQuery {
  kind: 'overlapCircle2d';
  center: Vec2;
  radius: number;
}

export interface BodyState2DQuery {
  kind: 'bodyState2d';
  entityId: number;
}

export type EngineQuery =
  | ListEntitiesQuery
  | EntityInfoQuery
  | GetComponentQuery
  | SetComponentQuery
  | Raycast2DQuery
  | OverlapCircle2DQuery
  | BodyState2DQuery;

/** Envelope a transport sends across the wire; `id` round-trips for request/response matching. */
export interface EngineQueryRequest {
  id: string;
  query: EngineQuery;
}

export type EngineQueryErrorCode =
  | 'no-live-instance'
  | 'no-physics-world'
  | 'not-found'
  | 'unknown-component';

export interface EngineQueryError {
  code: EngineQueryErrorCode;
  message: string;
}

export type EngineQueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: EngineQueryError };

/** Envelope a transport sends back; `id` matches the originating `EngineQueryRequest.id`. */
export interface EngineQueryResponse {
  id: string;
  result: EngineQueryResult<unknown>;
}

export interface EntitySummary {
  entityId: number;
  components: string[];
  name?: string;
  tags?: readonly string[];
  active?: boolean;
  x?: number;
  y?: number;
  rotation?: number;
}

export interface RaycastResultData {
  entityId: number;
  point: Vec2;
  normal: Vec2;
  toi: number;
}

export interface BodyStateData {
  position: Vec2;
  rotation: number;
  velocity: Vec2;
  type: string;
  isSensor: boolean;
}
