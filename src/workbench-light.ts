import { z, ZodError } from "zod";

type UnaryKind = "query" | "mutation";
type Kind = UnaryKind | "stream";

export type Op<K extends UnaryKind, I extends z.ZodTypeAny, O extends z.ZodTypeAny> =
  ((input: z.infer<I>) => Promise<z.infer<O>> | z.infer<O>) & {
    kind: K;
    input: I;
    output: O;
    meta?: Record<string, unknown>;
  };

export type StreamOp<I extends z.ZodTypeAny, C extends z.ZodTypeAny> =
  ((input: z.infer<I>) => AsyncIterable<z.infer<C>>) & {
    kind: "stream";
    input: I;
    chunk: C;
    meta?: Record<string, unknown>;
  };

type AnyOp = Op<any, any, any> | StreamOp<any, any>;

const define =
  <K extends UnaryKind>(kind: K) =>
  <I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
    input: I,
    output: O,
    handler: (i: z.infer<I>) => Promise<z.infer<O>> | z.infer<O>,
    meta?: Record<string, unknown>
  ): Op<K, I, O> =>
    Object.assign(handler, { kind, input, output, meta });

export const query = define("query");
export const mutate = define("mutation");

export const stream = <I extends z.ZodTypeAny, C extends z.ZodTypeAny>(
  input: I,
  chunk: C,
  handler: (i: z.infer<I>) => AsyncIterable<z.infer<C>>,
  meta?: Record<string, unknown>
): StreamOp<I, C> => Object.assign(handler, { kind: "stream" as const, input, chunk, meta });

/** =========================
 *  Events + lifecycle ctx
 *  ========================= */
export type Unsubscribe = () => void;

export interface Events {
  sub(name: string, handler: (...args: any[]) => void): Unsubscribe;
  emit(name: string, ...args: any[]): void;
}

class EventBus implements Events {
  private readonly subs = new Map<string, Set<(...args: any[]) => void>>();

  sub(name: string, handler: (...args: any[]) => void): Unsubscribe {
    let set = this.subs.get(name);
    if (!set) {
      set = new Set();
      this.subs.set(name, set);
    }
    set.add(handler);
    return () => {
      const s = this.subs.get(name);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) this.subs.delete(name);
    };
  }

  emit(name: string, ...args: any[]): void {
    const set = this.subs.get(name);
    if (!set) return;
    // Copy to allow mutations during emit.
    for (const fn of [...set]) fn(...args);
  }

  size(): number {
    let n = 0;
    for (const set of this.subs.values()) n += set.size;
    return n;
  }
}

export type WorkbenchContext = {
  events: Events;
  onInit(fn: () => void): void;
  onDispose(fn: () => void): void;
  init(): void;
  dispose(): void;
};

export function createWorkbenchContext(): WorkbenchContext & { _debug: { eventSubCount: () => number } } {
  const bus = new EventBus();
  const initFns: Array<() => void> = [];
  const disposeFns: Array<() => void> = [];
  let inited = false;
  let disposed = false;

  const ctx: WorkbenchContext & { _debug: { eventSubCount: () => number } } = {
    events: bus,
    onInit(fn) {
      if (disposed) throw new Error("WorkbenchContext is disposed");
      if (inited) {
        fn();
        return;
      }
      initFns.push(fn);
    },
    onDispose(fn) {
      if (disposed) {
        // Late registration - run immediately to avoid leaks.
        fn();
        return;
      }
      disposeFns.push(fn);
    },
    init() {
      if (disposed) throw new Error("WorkbenchContext is disposed");
      if (inited) return;
      inited = true;
      for (const fn of initFns.splice(0)) fn();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // LIFO disposal.
      for (const fn of disposeFns.splice(0).reverse()) fn();
    },
    _debug: {
      eventSubCount: () => bus.size()
    }
  };

  return ctx;
}

/** =========================
 *  Schema tree (what getApiSchema returns)
 *  ========================= */
export type ApiSchemaNode =
  | {
      kind: UnaryKind;
      input: z.ZodTypeAny;
      output: z.ZodTypeAny;
      meta?: Record<string, unknown>;
    }
  | {
      kind: "stream";
      input: z.ZodTypeAny;
      chunk: z.ZodTypeAny;
      meta?: Record<string, unknown>;
    }
  | { [key: string]: ApiSchemaNode };

type ModuleRuntime = {
  getApiSchema: () => ApiSchemaNode;
  dispose: () => void;
};

const WB_SCHEMA = Symbol("workbench-light.schema");
const WB_MODULE = Symbol("workbench-light.module");

export type Module<C extends WorkbenchContext, D extends ApiDef> = {
  getApiSchema: () => ApiSchemaNode;
  activate: (ctx?: C) => ActivatedFromDef<D>;
  [WB_MODULE]: true;
};

function isOp(x: unknown): x is AnyOp {
  const y = x as any;
  return typeof y === "function" && !!y.kind && !!y.input && (!!y.output || !!y.chunk);
}

function isModule(x: unknown): x is Module<any, any> {
  const y = x as any;
  return !!y && typeof y === "object" && typeof y.getApiSchema === "function" && typeof y.activate === "function";
}

function buildSchema(node: any): ApiSchemaNode {
  if (isOp(node)) {
    if (node.kind === "stream") {
      return { kind: "stream", input: node.input, chunk: (node as any).chunk, meta: node.meta };
    }
    return { kind: node.kind, input: node.input, output: (node as any).output, meta: node.meta };
  }
  if (isModule(node)) {
    return node.getApiSchema();
  }
  const out: Record<string, ApiSchemaNode> = {};
  for (const k of Object.keys(node)) out[k] = buildSchema(node[k]);
  return out;
}

type ApiDef = {
  [key: string]: AnyOp | ApiDef | Module<any, any>;
};

type ApiFromDef<D> =
  D extends Op<any, infer I, infer O>
    ? (input: z.infer<I>) => Promise<z.infer<O>>
    : D extends StreamOp<infer I, infer C>
      ? (input: z.infer<I>) => AsyncIterable<z.infer<C>>
      : D extends Module<any, infer MD>
        ? ActivatedFromDef<MD>
        : D extends Record<string, any>
          ? { [K in keyof D]: ApiFromDef<D[K]> }
          : never;

type ModuleFactory<D extends ApiDef> = (ctx: WorkbenchContext) => { api: D } | D;

type ActivatedFromDef<D> = ApiFromDef<D> & ModuleRuntime;

function defineRuntimeGetters(obj: any, schema: ApiSchemaNode, ctx: WorkbenchContext, ownsCtx: boolean): void {
  Object.defineProperty(obj, WB_SCHEMA, {
    value: schema,
    enumerable: false,
    configurable: false,
    writable: false
  });

  Object.defineProperty(obj, "getApiSchema", {
    value: () => obj[WB_SCHEMA] as ApiSchemaNode,
    enumerable: false,
    configurable: false,
    writable: false
  });

  Object.defineProperty(obj, "dispose", {
    value: () => {
      if (!ownsCtx) return;
      ctx.dispose();
    },
    enumerable: false,
    configurable: false,
    writable: false
  });
}

function buildRuntime(node: any, ctx: WorkbenchContext): any {
  if (isOp(node)) {
    if (node.kind === "stream") {
      return (input: unknown) => {
        const parsed = (node as any).input.parse(input);
        const iter = (node as any)(parsed) as AsyncIterable<unknown>;
        return (async function* () {
          for await (const chunk of iter) {
            yield (node as any).chunk.parse(chunk);
          }
        })();
      };
    }

    return async (input: unknown) => {
      const unary = node as Op<any, any, any>;
      const parsed = unary.input.parse(input);
      const out = await unary(parsed);
      return unary.output.parse(out);
    };
  }
  if (isModule(node)) {
    return node.activate(ctx);
  }
  const out: any = {};
  for (const k of Object.keys(node)) out[k] = buildRuntime(node[k], ctx);
  return out;
}

function createSchemaCtx(): WorkbenchContext {
  // Strict: schema introspection must not subscribe to events directly.
  const ctx = createWorkbenchContext();
  const throwingEvents: Events = {
    sub: () => {
      throw new Error("getApiSchema() must be side-effect free: move event subscriptions into ctx.onInit()");
    },
    emit: () => {}
  };

  return {
    events: throwingEvents,
    onInit: ctx.onInit,
    onDispose: ctx.onDispose,
    init: () => {},
    dispose: () => {}
  };
}

export function module<const D extends ApiDef>(def: D): Module<WorkbenchContext, D>;
export function module<C extends WorkbenchContext, const D extends ApiDef>(factory: (ctx: C) => { api: D } | D): Module<C, D>;
export function module<C extends WorkbenchContext, const D extends ApiDef>(defOrFactory: D | ((ctx: C) => { api: D } | D)): Module<C, D> {
  const activatedByCtx = new WeakMap<object, any>();

  const getDefForSchema = (): D => {
    if (typeof defOrFactory !== "function") return defOrFactory;
    const schemaCtx = createSchemaCtx();
    const out = (defOrFactory as (ctx: C) => { api: D } | D)(schemaCtx as unknown as C);
    return (out as any).api ? (out as any).api : (out as any);
  };

  const schema = buildSchema(getDefForSchema());

  const mod: Module<C, D> = {
    [WB_MODULE]: true as const,
    getApiSchema() {
      return schema;
    },
    activate(ctx?: WorkbenchContext) {
      const ownsCtx = !ctx;
      const sharedCtx = (ctx ?? createWorkbenchContext()) as unknown as C;
      const key = sharedCtx as unknown as object;

      const cached = activatedByCtx.get(key);
      if (cached) return cached;

      let def: D;
      if (typeof defOrFactory === "function") {
        const out = (defOrFactory as (ctx: C) => { api: D } | D)(sharedCtx) as any;
        def = (out?.api ?? out) as D;
      } else {
        def = defOrFactory;
      }

      const apiObj: any = buildRuntime(def, sharedCtx);
      defineRuntimeGetters(apiObj, schema, sharedCtx, ownsCtx);

      activatedByCtx.set(key, apiObj);
      sharedCtx.init();
      return apiObj as ActivatedFromDef<D>;
    }
  };

  return mod;
}

/**
 * Lightweight error helper for transports:
 * - normalizes ZodError to a stable shape
 */
export function toWorkbenchError(err: unknown): { name: string; message: string; issues?: unknown } {
  if (err instanceof ZodError) {
    return { name: "ZodError", message: err.message, issues: err.issues };
  }
  if (err instanceof Error) {
    return { name: err.name || "Error", message: err.message || String(err) };
  }
  return { name: "Error", message: typeof err === "string" ? err : JSON.stringify(err) };
}

