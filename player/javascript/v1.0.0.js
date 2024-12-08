import 'https://cdn.vidstack.io/icons';

const SCOPE = Symbol("SCOPE");
let scheduledEffects = false, runningEffects = false, currentScope = null, currentObserver = null, currentObservers = null, currentObserversIndex = 0, effects = [], defaultContext = {};
const NOOP = () => {
}, STATE_CLEAN = 0, STATE_CHECK = 1, STATE_DIRTY = 2, STATE_DISPOSED = 3;
function flushEffects() {
  scheduledEffects = true;
  queueMicrotask(runEffects);
}
function runEffects() {
  if (!effects.length) {
    scheduledEffects = false;
    return;
  }
  runningEffects = true;
  for (let i = 0; i < effects.length; i++) {
    if (effects[i]._state !== STATE_CLEAN)
      runTop(effects[i]);
  }
  effects = [];
  scheduledEffects = false;
  runningEffects = false;
}
function runTop(node) {
  let ancestors = [node];
  while (node = node[SCOPE]) {
    if (node._effect && node._state !== STATE_CLEAN)
      ancestors.push(node);
  }
  for (let i = ancestors.length - 1; i >= 0; i--) {
    updateCheck(ancestors[i]);
  }
}
function root(init) {
  const scope = createScope();
  return compute(scope, !init.length ? init : init.bind(null, dispose.bind(scope)), null);
}
function peek(fn) {
  return compute(currentScope, fn, null);
}
function untrack(fn) {
  return compute(null, fn, null);
}
function tick() {
  if (!runningEffects)
    runEffects();
}
function getScope() {
  return currentScope;
}
function scoped(run, scope) {
  try {
    return compute(scope, run, null);
  } catch (error) {
    handleError(scope, error);
    return;
  }
}
function getContext(key, scope = currentScope) {
  return scope?._context[key];
}
function setContext(key, value, scope = currentScope) {
  if (scope)
    scope._context = { ...scope._context, [key]: value };
}
function onDispose(disposable) {
  if (!disposable || !currentScope)
    return disposable || NOOP;
  const node = currentScope;
  if (!node._disposal) {
    node._disposal = disposable;
  } else if (Array.isArray(node._disposal)) {
    node._disposal.push(disposable);
  } else {
    node._disposal = [node._disposal, disposable];
  }
  return function removeDispose() {
    if (node._state === STATE_DISPOSED)
      return;
    disposable.call(null);
    if (isFunction$1(node._disposal)) {
      node._disposal = null;
    } else if (Array.isArray(node._disposal)) {
      node._disposal.splice(node._disposal.indexOf(disposable), 1);
    }
  };
}
function dispose(self = true) {
  if (this._state === STATE_DISPOSED)
    return;
  if (this._children) {
    if (Array.isArray(this._children)) {
      for (let i = this._children.length - 1; i >= 0; i--) {
        dispose.call(this._children[i]);
      }
    } else {
      dispose.call(this._children);
    }
  }
  if (self) {
    const parent = this[SCOPE];
    if (parent) {
      if (Array.isArray(parent._children)) {
        parent._children.splice(parent._children.indexOf(this), 1);
      } else {
        parent._children = null;
      }
    }
    disposeNode(this);
  }
}
function disposeNode(node) {
  node._state = STATE_DISPOSED;
  if (node._disposal)
    emptyDisposal(node);
  if (node._sources)
    removeSourceObservers(node, 0);
  node[SCOPE] = null;
  node._sources = null;
  node._observers = null;
  node._children = null;
  node._context = defaultContext;
  node._handlers = null;
}
function emptyDisposal(scope) {
  try {
    if (Array.isArray(scope._disposal)) {
      for (let i = scope._disposal.length - 1; i >= 0; i--) {
        const callable = scope._disposal[i];
        callable.call(callable);
      }
    } else {
      scope._disposal.call(scope._disposal);
    }
    scope._disposal = null;
  } catch (error) {
    handleError(scope, error);
  }
}
function compute(scope, compute2, observer) {
  const prevScope = currentScope, prevObserver = currentObserver;
  currentScope = scope;
  currentObserver = observer;
  try {
    return compute2.call(scope);
  } finally {
    currentScope = prevScope;
    currentObserver = prevObserver;
  }
}
function handleError(scope, error) {
  if (!scope || !scope._handlers)
    throw error;
  let i = 0, len = scope._handlers.length, currentError = error;
  for (i = 0; i < len; i++) {
    try {
      scope._handlers[i](currentError);
      break;
    } catch (error2) {
      currentError = error2;
    }
  }
  if (i === len)
    throw currentError;
}
function read() {
  if (this._state === STATE_DISPOSED)
    return this._value;
  if (currentObserver && !this._effect) {
    if (!currentObservers && currentObserver._sources && currentObserver._sources[currentObserversIndex] == this) {
      currentObserversIndex++;
    } else if (!currentObservers)
      currentObservers = [this];
    else
      currentObservers.push(this);
  }
  if (this._compute)
    updateCheck(this);
  return this._value;
}
function write(newValue) {
  const value = isFunction$1(newValue) ? newValue(this._value) : newValue;
  if (this._changed(this._value, value)) {
    this._value = value;
    if (this._observers) {
      for (let i = 0; i < this._observers.length; i++) {
        notify(this._observers[i], STATE_DIRTY);
      }
    }
  }
  return this._value;
}
const ScopeNode = function Scope() {
  this[SCOPE] = null;
  this._children = null;
  if (currentScope)
    currentScope.append(this);
};
const ScopeProto = ScopeNode.prototype;
ScopeProto._context = defaultContext;
ScopeProto._handlers = null;
ScopeProto._compute = null;
ScopeProto._disposal = null;
ScopeProto.append = function(child) {
  child[SCOPE] = this;
  if (!this._children) {
    this._children = child;
  } else if (Array.isArray(this._children)) {
    this._children.push(child);
  } else {
    this._children = [this._children, child];
  }
  child._context = child._context === defaultContext ? this._context : { ...this._context, ...child._context };
  if (this._handlers) {
    child._handlers = !child._handlers ? this._handlers : [...child._handlers, ...this._handlers];
  }
};
ScopeProto.dispose = function() {
  dispose.call(this);
};
function createScope() {
  return new ScopeNode();
}
const ComputeNode = function Computation(initialValue, compute2, options) {
  ScopeNode.call(this);
  this._state = compute2 ? STATE_DIRTY : STATE_CLEAN;
  this._init = false;
  this._effect = false;
  this._sources = null;
  this._observers = null;
  this._value = initialValue;
  this.id = options?.id ?? (this._compute ? "computed" : "signal");
  if (compute2)
    this._compute = compute2;
  if (options && options.dirty)
    this._changed = options.dirty;
};
const ComputeProto = ComputeNode.prototype;
Object.setPrototypeOf(ComputeProto, ScopeProto);
ComputeProto._changed = isNotEqual;
ComputeProto.call = read;
function createComputation(initialValue, compute2, options) {
  return new ComputeNode(initialValue, compute2, options);
}
function isNotEqual(a, b) {
  return a !== b;
}
function isFunction$1(value) {
  return typeof value === "function";
}
function updateCheck(node) {
  if (node._state === STATE_CHECK) {
    for (let i = 0; i < node._sources.length; i++) {
      updateCheck(node._sources[i]);
      if (node._state === STATE_DIRTY) {
        break;
      }
    }
  }
  if (node._state === STATE_DIRTY)
    update(node);
  else
    node._state = STATE_CLEAN;
}
function cleanup(node) {
  if (node._children)
    dispose.call(node, false);
  if (node._disposal)
    emptyDisposal(node);
  node._handlers = node[SCOPE] ? node[SCOPE]._handlers : null;
}
function update(node) {
  let prevObservers = currentObservers, prevObserversIndex = currentObserversIndex;
  currentObservers = null;
  currentObserversIndex = 0;
  try {
    cleanup(node);
    const result = compute(node, node._compute, node);
    updateObservers(node);
    if (!node._effect && node._init) {
      write.call(node, result);
    } else {
      node._value = result;
      node._init = true;
    }
  } catch (error) {
    if (!node._init && typeof node._value === "undefined") {
      console.error(
        `computed \`${node.id}\` threw error during first run, this can be fatal.

Solutions:

1. Set the \`initial\` option to silence this error`,
        "\n2. Or, use an `effect` if the return value is not being used",
        "\n\n",
        error
      );
    }
    updateObservers(node);
    handleError(node, error);
  } finally {
    currentObservers = prevObservers;
    currentObserversIndex = prevObserversIndex;
    node._state = STATE_CLEAN;
  }
}
function updateObservers(node) {
  if (currentObservers) {
    if (node._sources)
      removeSourceObservers(node, currentObserversIndex);
    if (node._sources && currentObserversIndex > 0) {
      node._sources.length = currentObserversIndex + currentObservers.length;
      for (let i = 0; i < currentObservers.length; i++) {
        node._sources[currentObserversIndex + i] = currentObservers[i];
      }
    } else {
      node._sources = currentObservers;
    }
    let source;
    for (let i = currentObserversIndex; i < node._sources.length; i++) {
      source = node._sources[i];
      if (!source._observers)
        source._observers = [node];
      else
        source._observers.push(node);
    }
  } else if (node._sources && currentObserversIndex < node._sources.length) {
    removeSourceObservers(node, currentObserversIndex);
    node._sources.length = currentObserversIndex;
  }
}
function notify(node, state) {
  if (node._state >= state)
    return;
  if (node._effect && node._state === STATE_CLEAN) {
    effects.push(node);
    if (!scheduledEffects)
      flushEffects();
  }
  node._state = state;
  if (node._observers) {
    for (let i = 0; i < node._observers.length; i++) {
      notify(node._observers[i], STATE_CHECK);
    }
  }
}
function removeSourceObservers(node, index) {
  let source, swap;
  for (let i = index; i < node._sources.length; i++) {
    source = node._sources[i];
    if (source._observers) {
      swap = source._observers.indexOf(node);
      source._observers[swap] = source._observers[source._observers.length - 1];
      source._observers.pop();
    }
  }
}
function noop(...args) {
}
function isNull(value) {
  return value === null;
}
function isUndefined(value) {
  return typeof value === "undefined";
}
function isNil(value) {
  return isNull(value) || isUndefined(value);
}
function isObject(value) {
  return value?.constructor === Object;
}
function isNumber(value) {
  return typeof value === "number" && !Number.isNaN(value);
}
function isString(value) {
  return typeof value === "string";
}
function isBoolean(value) {
  return typeof value === "boolean";
}
function isFunction(value) {
  return typeof value === "function";
}
function isArray$1(value) {
  return Array.isArray(value);
}
const EVENT = Event, DOM_EVENT = Symbol("DOM_EVENT");
class DOMEvent extends EVENT {
  [DOM_EVENT] = true;
  /**
   * The event detail.
   */
  detail;
  /**
   * The event trigger chain.
   */
  triggers = new EventTriggers();
  /**
   * The preceding event that was responsible for this event being fired.
   */
  get trigger() {
    return this.triggers.source;
  }
  /**
   * The origin event that lead to this event being fired.
   */
  get originEvent() {
    return this.triggers.origin;
  }
  /**
   * Whether the origin event was triggered by the user.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted}
   */
  get isOriginTrusted() {
    return this.triggers.origin?.isTrusted ?? false;
  }
  constructor(type, ...init) {
    super(type, init[0]);
    this.detail = init[0]?.detail;
    const trigger = init[0]?.trigger;
    if (trigger) this.triggers.add(trigger);
  }
}
class EventTriggers {
  chain = [];
  get source() {
    return this.chain[0];
  }
  get origin() {
    return this.chain[this.chain.length - 1];
  }
  /**
   * Appends the event to the end of the chain.
   */
  add(event) {
    this.chain.push(event);
    if (isDOMEvent(event)) {
      this.chain.push(...event.triggers);
    }
  }
  /**
   * Removes the event from the chain and returns it (if found).
   */
  remove(event) {
    return this.chain.splice(this.chain.indexOf(event), 1)[0];
  }
  /**
   * Returns whether the chain contains the given `event`.
   */
  has(event) {
    return this.chain.some((e) => e === event);
  }
  /**
   * Returns whether the chain contains the given event type.
   */
  hasType(type) {
    return !!this.findType(type);
  }
  /**
   * Returns the first event with the given `type` found in the chain.
   */
  findType(type) {
    return this.chain.find((e) => e.type === type);
  }
  /**
   * Walks an event chain on a given `event`, and invokes the given `callback` for each trigger event.
   */
  walk(callback) {
    for (const event of this.chain) {
      const returnValue = callback(event);
      if (returnValue) return [event, returnValue];
    }
  }
  [Symbol.iterator]() {
    return this.chain.values();
  }
}
function isDOMEvent(event) {
  return !!event?.[DOM_EVENT];
}
class EventsTarget extends EventTarget {
  /** @internal type only */
  $ts__events;
  addEventListener(type, callback, options) {
    return super.addEventListener(type, callback, options);
  }
  removeEventListener(type, callback, options) {
    return super.removeEventListener(type, callback, options);
  }
}
function listenEvent(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return onDispose(() => target.removeEventListener(type, handler, options));
}
class EventsController {
  #target;
  #controller;
  get signal() {
    return this.#controller.signal;
  }
  constructor(target) {
    this.#target = target;
    this.#controller = new AbortController();
    onDispose(this.abort.bind(this));
  }
  add(type, handler, options) {
    if (this.signal.aborted) throw Error("aborted");
    this.#target.addEventListener(type, handler, {
      ...options,
      signal: options?.signal ? anySignal(this.signal, options.signal) : this.signal
    });
    return this;
  }
  remove(type, handler) {
    this.#target.removeEventListener(type, handler);
    return this;
  }
  abort(reason) {
    this.#controller.abort(reason);
  }
}
function anySignal(...signals) {
  const controller = new AbortController(), options = { signal: controller.signal };
  function onAbort(event) {
    controller.abort(event.target.reason);
  }
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", onAbort, options);
  }
  return controller.signal;
}
function isPointerEvent(event) {
  return !!event?.type.startsWith("pointer");
}
function isTouchEvent(event) {
  return !!event?.type.startsWith("touch");
}
function isMouseEvent(event) {
  return /^(click|mouse)/.test(event?.type ?? "");
}
function isKeyboardEvent(event) {
  return !!event?.type.startsWith("key");
}
function wasEnterKeyPressed(event) {
  return isKeyboardEvent(event) && event.key === "Enter";
}
function isKeyboardClick(event) {
  return isKeyboardEvent(event) && (event.key === "Enter" || event.key === " ");
}
function isDOMNode(node) {
  return node instanceof Node;
}
function setAttribute(host, name, value) {
  if (!host) return;
  else if (!value && value !== "" && value !== 0) {
    host.removeAttribute(name);
  } else {
    const attrValue = value === true ? "" : value + "";
    if (host.getAttribute(name) !== attrValue) {
      host.setAttribute(name, attrValue);
    }
  }
}
function setStyle(host, property, value) {
  if (!host) return;
  else if (!value && value !== 0) {
    host.style.removeProperty(property);
  } else {
    host.style.setProperty(property, value + "");
  }
}
function toggleClass(host, name, value) {
  host.classList[value ? "add" : "remove"](name);
}

function signal(initialValue, options) {
  const node = createComputation(initialValue, null, options), signal2 = read.bind(node);
  signal2.node = node;
  signal2[SCOPE] = true;
  signal2.set = write.bind(node);
  return signal2;
}
function isReadSignal(fn) {
  return isFunction$1(fn) && SCOPE in fn;
}
function computed(compute, options) {
  const node = createComputation(
    options?.initial,
    compute,
    options
  ), signal2 = read.bind(node);
  signal2[SCOPE] = true;
  signal2.node = node;
  return signal2;
}
function effect$1(effect2, options) {
  const signal2 = createComputation(
    null,
    function runEffect() {
      let effectResult = effect2();
      isFunction$1(effectResult) && onDispose(effectResult);
      return null;
    },
    { id: options?.id ?? "effect" }
  );
  signal2._effect = true;
  update(signal2);
  {
    return function stopEffect() {
      dispose.call(signal2, true);
    };
  }
}
function isWriteSignal(fn) {
  return isReadSignal(fn) && "set" in fn;
}
const effect = effect$1;
function createContext(provide) {
  return { id: Symbol(), provide };
}
function provideContext(context, value, scope = getScope()) {
  if (!scope) {
    throw Error("[maverick] attempting to provide context outside root");
  }
  const hasProvidedValue = !isUndefined(value);
  if (!hasProvidedValue && !context.provide) {
    throw Error("[maverick] context can not be provided without a value or `provide` function");
  }
  setContext(context.id, hasProvidedValue ? value : context.provide?.(), scope);
}
function useContext(context) {
  const value = getContext(context.id);
  if (isUndefined(value)) {
    throw Error("[maverick] attempting to use context without providing first");
  }
  return value;
}
function hasProvidedContext(context) {
  return !isUndefined(getContext(context.id));
}
const PROPS = /* @__PURE__ */ Symbol("PROPS");
const METHODS = /* @__PURE__ */ Symbol("METHODS");
const ON_DISPATCH = /* @__PURE__ */ Symbol("ON_DISPATCH");
const EMPTY_PROPS = {};
class Instance {
  /** @internal type only */
  $ts__events;
  /** @internal type only */
  $ts__vars;
  /* @internal */
  [ON_DISPATCH] = null;
  $el = signal(null);
  el = null;
  scope = null;
  attachScope = null;
  connectScope = null;
  component = null;
  destroyed = false;
  props = EMPTY_PROPS;
  attrs = null;
  styles = null;
  state;
  $state;
  #setupCallbacks = [];
  #attachCallbacks = [];
  #connectCallbacks = [];
  #destroyCallbacks = [];
  constructor(Component, scope, init) {
    this.scope = scope;
    if (init?.scope) init.scope.append(scope);
    let stateFactory = Component.state, props = Component.props;
    if (stateFactory) {
      this.$state = stateFactory.create();
      this.state = new Proxy(this.$state, {
        get: (_, prop) => this.$state[prop]()
      });
      provideContext(stateFactory, this.$state);
    }
    if (props) {
      this.props = createInstanceProps(props);
      if (init?.props) {
        for (const prop of Object.keys(init.props)) {
          this.props[prop]?.set(init.props[prop]);
        }
      }
    }
    onDispose(this.destroy.bind(this));
  }
  setup() {
    scoped(() => {
      for (const callback of this.#setupCallbacks) callback();
    }, this.scope);
  }
  attach(el) {
    if (this.el) return;
    this.el = el;
    this.$el.set(el);
    {
      el.$$COMPONENT_NAME = this.component?.constructor.name;
    }
    scoped(() => {
      this.attachScope = createScope();
      scoped(() => {
        for (const callback of this.#attachCallbacks) callback(this.el);
        this.#attachAttrs();
        this.#attachStyles();
      }, this.attachScope);
    }, this.scope);
    el.dispatchEvent(new Event("attached"));
  }
  detach() {
    this.attachScope?.dispose();
    this.attachScope = null;
    this.connectScope = null;
    if (this.el) {
      this.el.$$COMPONENT_NAME = null;
    }
    this.el = null;
    this.$el.set(null);
  }
  connect() {
    if (!this.el || !this.attachScope || !this.#connectCallbacks.length) return;
    scoped(() => {
      this.connectScope = createScope();
      scoped(() => {
        for (const callback of this.#connectCallbacks) callback(this.el);
      }, this.connectScope);
    }, this.attachScope);
  }
  disconnect() {
    this.connectScope?.dispose();
    this.connectScope = null;
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    scoped(() => {
      for (const callback of this.#destroyCallbacks) callback(this.el);
    }, this.scope);
    const el = this.el;
    this.detach();
    this.scope.dispose();
    this.#setupCallbacks.length = 0;
    this.#attachCallbacks.length = 0;
    this.#connectCallbacks.length = 0;
    this.#destroyCallbacks.length = 0;
    this.component = null;
    this.attrs = null;
    this.styles = null;
    this.props = EMPTY_PROPS;
    this.scope = null;
    this.state = EMPTY_PROPS;
    this.$state = null;
    if (el) delete el.$;
  }
  addHooks(target) {
    if (target.onSetup) this.#setupCallbacks.push(target.onSetup.bind(target));
    if (target.onAttach) this.#attachCallbacks.push(target.onAttach.bind(target));
    if (target.onConnect) this.#connectCallbacks.push(target.onConnect.bind(target));
    if (target.onDestroy) this.#destroyCallbacks.push(target.onDestroy.bind(target));
  }
  #attachAttrs() {
    if (!this.attrs) return;
    for (const name of Object.keys(this.attrs)) {
      if (isFunction(this.attrs[name])) {
        effect(this.#setAttr.bind(this, name));
      } else {
        setAttribute(this.el, name, this.attrs[name]);
      }
    }
  }
  #attachStyles() {
    if (!this.styles) return;
    for (const name of Object.keys(this.styles)) {
      if (isFunction(this.styles[name])) {
        effect(this.#setStyle.bind(this, name));
      } else {
        setStyle(this.el, name, this.styles[name]);
      }
    }
  }
  #setAttr(name) {
    setAttribute(this.el, name, this.attrs[name].call(this.component));
  }
  #setStyle(name) {
    setStyle(this.el, name, this.styles[name].call(this.component));
  }
}
function createInstanceProps(props) {
  const $props = {};
  for (const name of Object.keys(props)) {
    const def = props[name];
    $props[name] = signal(def, def);
  }
  return $props;
}
let currentInstance = { $$: null };
function createComponent(Component, init) {
  return root(() => {
    currentInstance.$$ = new Instance(Component, getScope(), init);
    const component = new Component();
    currentInstance.$$.component = component;
    currentInstance.$$ = null;
    return component;
  });
}
class ViewController extends EventTarget {
  /** @internal */
  $$;
  get el() {
    return this.$$.el;
  }
  get $el() {
    return this.$$.$el();
  }
  get scope() {
    return this.$$.scope;
  }
  get attachScope() {
    return this.$$.attachScope;
  }
  get connectScope() {
    return this.$$.connectScope;
  }
  /** @internal */
  get $props() {
    return this.$$.props;
  }
  /** @internal */
  get $state() {
    return this.$$.$state;
  }
  get state() {
    return this.$$.state;
  }
  constructor() {
    super();
    if (currentInstance.$$) this.attach(currentInstance);
  }
  attach({ $$ }) {
    this.$$ = $$;
    $$.addHooks(this);
    return this;
  }
  addEventListener(type, callback, options) {
    if (!this.el) {
      const name = this.constructor.name;
      console.warn(`[maverick] adding event listener to \`${name}\` before element is attached`);
    }
    this.listen(type, callback, options);
  }
  removeEventListener(type, callback, options) {
    this.el?.removeEventListener(type, callback, options);
  }
  /**
   * The given callback is invoked when the component is ready to be set up.
   *
   * - This hook will run once.
   * - This hook is called both client-side and server-side.
   * - It's safe to use context inside this hook.
   * - The host element has not attached yet - wait for `onAttach`.
   */
  /**
   * This method can be used to specify attributes that should be set on the host element. Any
   * attributes that are assigned to a function will be considered a signal and updated accordingly.
   */
  setAttributes(attributes) {
    if (!this.$$.attrs) this.$$.attrs = {};
    Object.assign(this.$$.attrs, attributes);
  }
  /**
   * This method can be used to specify styles that should set be set on the host element. Any
   * styles that are assigned to a function will be considered a signal and updated accordingly.
   */
  setStyles(styles) {
    if (!this.$$.styles) this.$$.styles = {};
    Object.assign(this.$$.styles, styles);
  }
  /**
   * This method is used to satisfy the CSS variables contract specified on the current
   * component. Other CSS variables can be set via the `setStyles` method.
   */
  setCSSVars(vars) {
    this.setStyles(vars);
  }
  /**
   * Type-safe utility for creating component DOM events.
   */
  createEvent(type, ...init) {
    return new DOMEvent(type, init[0]);
  }
  /**
   * Creates a `DOMEvent` and dispatches it from the host element. This method is typed to
   * match all component events.
   */
  dispatch(type, ...init) {
    if (!this.el) return false;
    const event = type instanceof Event ? type : new DOMEvent(type, init[0]);
    Object.defineProperty(event, "target", {
      get: () => this.$$.component
    });
    return untrack(() => {
      this.$$[ON_DISPATCH]?.(event);
      return this.el.dispatchEvent(event);
    });
  }
  dispatchEvent(event) {
    return this.dispatch(event);
  }
  /**
   * Adds an event listener for the given `type` and returns a function which can be invoked to
   * remove the event listener.
   *
   * - The listener is removed if the current scope is disposed.
   * - This method is safe to use on the server (noop).
   */
  listen(type, handler, options) {
    if (!this.el) return noop;
    return listenEvent(this.el, type, handler, options);
  }
}

function runAll(fns, arg) {
  for (const fn of fns) fn(arg);
}

function camelToKebabCase(str) {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
function kebabToCamelCase(str) {
  return str.replace(/-./g, (x) => x[1].toUpperCase());
}
function uppercaseFirstChar(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const STRING = (v) => v === null ? "" : v + "";
const NULLABLE_STRING = (v) => v === null ? null : v + "";
const NUMBER = (v) => v === null ? 0 : Number(v);
const BOOLEAN = (v) => v !== null;
const FUNCTION = () => null;
const ARRAY = (v) => v === null ? [] : JSON.parse(v);
const OBJECT = (v) => v === null ? {} : JSON.parse(v);
function inferAttributeConverter(value) {
  if (value === null) return NULLABLE_STRING;
  switch (typeof value) {
    case "undefined":
      return STRING;
    case "string":
      return STRING;
    case "boolean":
      return BOOLEAN;
    case "number":
      return NUMBER;
    case "function":
      return FUNCTION;
    case "object":
      return isArray$1(value) ? ARRAY : OBJECT;
    default:
      return STRING;
  }
}
const ATTRS = /* @__PURE__ */ Symbol("ATTRS");
const SETUP = /* @__PURE__ */ Symbol("SETUP");
const SETUP_STATE = /* @__PURE__ */ Symbol("SETUP_STATE");
const SETUP_CALLBACKS = /* @__PURE__ */ Symbol("SETUP_CALLBACKS");
var SetupState;
(function(SetupState2) {
  const Idle = 0;
  SetupState2[SetupState2["Idle"] = Idle] = "Idle";
  const Pending = 1;
  SetupState2[SetupState2["Pending"] = Pending] = "Pending";
  const Ready = 2;
  SetupState2[SetupState2["Ready"] = Ready] = "Ready";
})(SetupState || (SetupState = {}));
function Host(Super, Component) {
  class MaverickElement extends Super {
    static attrs;
    static [ATTRS] = null;
    static get observedAttributes() {
      if (!this[ATTRS] && Component.props) {
        const map = /* @__PURE__ */ new Map();
        for (const propName of Object.keys(Component.props)) {
          let attr = this.attrs?.[propName], attrName = isString(attr) ? attr : !attr ? attr : attr?.attr;
          if (attrName === false) continue;
          if (!attrName) attrName = camelToKebabCase(propName);
          map.set(attrName, {
            prop: propName,
            converter: attr && !isString(attr) && attr?.converter || inferAttributeConverter(Component.props[propName])
          });
        }
        this[ATTRS] = map;
      }
      return this[ATTRS] ? Array.from(this[ATTRS].keys()) : [];
    }
    $;
    [SETUP_STATE] = SetupState.Idle;
    [SETUP_CALLBACKS] = null;
    keepAlive = false;
    forwardKeepAlive = true;
    get scope() {
      return this.$.$$.scope;
    }
    get attachScope() {
      return this.$.$$.attachScope;
    }
    get connectScope() {
      return this.$.$$.connectScope;
    }
    get $props() {
      return this.$.$$.props;
    }
    get $state() {
      return this.$.$$.$state;
    }
    get state() {
      return this.$.state;
    }
    constructor(...args) {
      super(...args);
      this.$ = scoped(() => createComponent(Component), null);
      this.$.$$.addHooks(this);
      if (Component.props) {
        const props = this.$props, descriptors = Object.getOwnPropertyDescriptors(this);
        for (const prop of Object.keys(descriptors)) {
          if (prop in Component.props) {
            props[prop].set(this[prop]);
            delete this[prop];
          }
        }
      }
    }
    attributeChangedCallback(name, _, newValue) {
      const Ctor = this.constructor;
      if (!Ctor[ATTRS]) {
        super.attributeChangedCallback?.(name, _, newValue);
        return;
      }
      const def = Ctor[ATTRS].get(name);
      if (def) this[def.prop] = def.converter(newValue);
    }
    connectedCallback() {
      const instance = this.$?.$$;
      if (!instance || instance.destroyed) return;
      if (this[SETUP_STATE] !== SetupState.Ready) {
        setup.call(this);
        return;
      }
      if (!this.isConnected) return;
      if (this.hasAttribute("keep-alive")) {
        this.keepAlive = true;
      }
      instance.connect();
      if (isArray$1(this[SETUP_CALLBACKS])) runAll(this[SETUP_CALLBACKS], this);
      this[SETUP_CALLBACKS] = null;
      const callback = super.connectedCallback;
      if (callback) scoped(() => callback.call(this), this.connectScope);
      return;
    }
    disconnectedCallback() {
      const instance = this.$?.$$;
      if (!instance || instance.destroyed) return;
      instance.disconnect();
      const callback = super.disconnectedCallback;
      if (callback) callback.call(this);
      if (!this.keepAlive && !this.hasAttribute("keep-alive")) {
        setTimeout(() => {
          requestAnimationFrame(() => {
            if (!this.isConnected) instance.destroy();
          });
        }, 0);
      }
    }
    [SETUP]() {
      const instance = this.$.$$, Ctor = this.constructor;
      if (instance.destroyed) {
        console.warn(`[maverick] attempted attaching to destroyed element \`${this.tagName}\``);
      }
      if (instance.destroyed) return;
      const attrs = Ctor[ATTRS];
      if (attrs) {
        for (const attr of this.attributes) {
          let def = attrs.get(attr.name);
          if (def && def.converter) {
            instance.props[def.prop].set(def.converter(this.getAttribute(attr.name)));
          }
        }
      }
      instance.setup();
      instance.attach(this);
      this[SETUP_STATE] = SetupState.Ready;
      this.connectedCallback();
    }
    // @ts-expect-error
    subscribe(callback) {
      return this.$.subscribe(callback);
    }
    destroy() {
      this.disconnectedCallback();
      this.$.destroy();
    }
  }
  extendProto(MaverickElement, Component);
  return MaverickElement;
}
function extendProto(Element, Component) {
  const ElementProto = Element.prototype, ComponentProto = Component.prototype;
  if (Component.props) {
    for (const prop of Object.keys(Component.props)) {
      Object.defineProperty(ElementProto, prop, {
        enumerable: true,
        configurable: true,
        get() {
          return this.$props[prop]();
        },
        set(value) {
          this.$props[prop].set(value);
        }
      });
    }
  }
  if (ComponentProto[PROPS]) {
    for (const name of ComponentProto[PROPS]) {
      Object.defineProperty(ElementProto, name, {
        enumerable: true,
        configurable: true,
        get() {
          return this.$[name];
        },
        set(value) {
          this.$[name] = value;
        }
      });
    }
  }
  if (ComponentProto[METHODS]) {
    for (const name of ComponentProto[METHODS]) {
      ElementProto[name] = function(...args) {
        return this.$[name](...args);
      };
    }
  }
}
function setup() {
  if (this[SETUP_STATE] !== SetupState.Idle) return;
  this[SETUP_STATE] = SetupState.Pending;
  const parent = findParent(this), isParentRegistered = parent && window.customElements.get(parent.localName), isParentSetup = parent && parent[SETUP_STATE] === SetupState.Ready;
  if (parent && (!isParentRegistered || !isParentSetup)) {
    waitForParent.call(this, parent);
    return;
  }
  attach.call(this, parent);
}
async function waitForParent(parent) {
  await window.customElements.whenDefined(parent.localName);
  if (parent[SETUP_STATE] !== SetupState.Ready) {
    await new Promise((res) => (parent[SETUP_CALLBACKS] ??= []).push(res));
  }
  attach.call(this, parent);
}
function attach(parent) {
  if (!this.isConnected) return;
  if (parent) {
    if (parent.keepAlive && parent.forwardKeepAlive) {
      this.keepAlive = true;
      this.setAttribute("keep-alive", "");
    }
    const scope = this.$.$$.scope;
    if (scope) parent.$.$$.attachScope.append(scope);
  }
  this[SETUP]();
}
function findParent(host) {
  let node = host.parentNode, prefix = host.localName.split("-", 1)[0] + "-";
  while (node) {
    if (node.nodeType === 1 && node.localName.startsWith(prefix)) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}
function defineCustomElement(element, throws = false) {
  if (throws || !window.customElements.get(element.tagName)) {
    window.customElements.define(element.tagName, element);
  }
}

class Component extends ViewController {
  subscribe(callback) {
    if (!this.state) {
      const name = this.constructor.name;
      throw Error(
        `[maverick] component \`${name}\` can not be subscribed to because it has no internal state`
      );
    }
    return scoped(() => effect(() => callback(this.state)), this.$$.scope);
  }
  destroy() {
    this.$$.destroy();
  }
}
function prop(target, propertyKey, descriptor) {
  if (!target[PROPS]) target[PROPS] = /* @__PURE__ */ new Set();
  target[PROPS].add(propertyKey);
}
function method(target, propertyKey, descriptor) {
  if (!target[METHODS]) target[METHODS] = /* @__PURE__ */ new Set();
  target[METHODS].add(propertyKey);
}
class State {
  id = Symbol("STATE");
  record;
  #descriptors;
  constructor(record) {
    this.record = record;
    this.#descriptors = Object.getOwnPropertyDescriptors(record);
  }
  create() {
    const store = {}, state = new Proxy(store, { get: (_, prop2) => store[prop2]() });
    for (const name of Object.keys(this.record)) {
      const getter = this.#descriptors[name].get;
      store[name] = getter ? computed(getter.bind(state)) : signal(this.record[name]);
    }
    return store;
  }
  reset(record, filter) {
    for (const name of Object.keys(record)) {
      if (!this.#descriptors[name].get && (!filter || filter(name))) {
        record[name].set(this.record[name]);
      }
    }
  }
}
function useState(state) {
  return useContext(state);
}

function unwrap(fn) {
  return isFunction(fn) ? fn() : fn;
}
function ariaBool$1(value) {
  return value ? "true" : "false";
}
function createDisposalBin() {
  const disposal = /* @__PURE__ */ new Set();
  return {
    add(...callbacks) {
      for (const callback of callbacks) disposal.add(callback);
    },
    empty() {
      for (const callback of disposal) callback();
      disposal.clear();
    }
  };
}
function keysOf(obj) {
  return Object.keys(obj);
}
function deferredPromise() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function waitTimeout(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}
function animationFrameThrottle(func) {
  let id = -1, lastArgs;
  function throttle(...args) {
    lastArgs = args;
    if (id >= 0) return;
    id = window.requestAnimationFrame(() => {
      func.apply(this, lastArgs);
      id = -1;
      lastArgs = void 0;
    });
  }
  return throttle;
}
const requestIdleCallback = typeof window !== "undefined" ? "requestIdleCallback" in window ? window.requestIdleCallback : (cb) => window.setTimeout(cb, 1) : noop;
function waitIdlePeriod(callback, options) {
  return new Promise((resolve) => {
    requestIdleCallback((deadline) => {
      callback?.(deadline);
      resolve();
    }, options);
  });
}

const MEDIA_ATTRIBUTES = Symbol("MEDIA_ATTRIBUTES" );
const mediaAttributes = [
  "autoPlay",
  "canAirPlay",
  "canFullscreen",
  "canGoogleCast",
  "canLoad",
  "canLoadPoster",
  "canPictureInPicture",
  "canPlay",
  "canSeek",
  "ended",
  "fullscreen",
  "isAirPlayConnected",
  "isGoogleCastConnected",
  "live",
  "liveEdge",
  "loop",
  "mediaType",
  "muted",
  "paused",
  "pictureInPicture",
  "playing",
  "playsInline",
  "remotePlaybackState",
  "remotePlaybackType",
  "seeking",
  "started",
  "streamType",
  "viewType",
  "waiting"
];

const mediaContext = createContext();
function useMediaContext() {
  return useContext(mediaContext);
}
function useMediaState() {
  return useMediaContext().$state;
}

function isHTMLAudioElement(element) {
  return element instanceof HTMLAudioElement;
}
function isHTMLVideoElement(element) {
  return element instanceof HTMLVideoElement;
}
function isHTMLMediaElement(element) {
  return isHTMLAudioElement(element) || isHTMLVideoElement(element);
}
function isHTMLIFrameElement(element) {
  return element instanceof HTMLIFrameElement;
}

class MediaPlayerController extends ViewController {
}

const MEDIA_KEY_SHORTCUTS = {
  togglePaused: "k Space",
  toggleMuted: "m",
  toggleFullscreen: "f",
  togglePictureInPicture: "i",
  toggleCaptions: "c",
  seekBackward: "j J ArrowLeft",
  seekForward: "l L ArrowRight",
  volumeUp: "ArrowUp",
  volumeDown: "ArrowDown",
  speedUp: ">",
  slowDown: "<"
};
const MODIFIER_KEYS = /* @__PURE__ */ new Set(["Shift", "Alt", "Meta", "Ctrl"]), BUTTON_SELECTORS = 'button, [role="button"]', IGNORE_SELECTORS = 'input, textarea, select, [contenteditable], [role^="menuitem"], [role="timer"]';
class MediaKeyboardController extends MediaPlayerController {
  #media;
  constructor(media) {
    super();
    this.#media = media;
  }
  onConnect() {
    effect(this.#onTargetChange.bind(this));
  }
  #onTargetChange() {
    const { keyDisabled, keyTarget } = this.$props;
    if (keyDisabled()) return;
    const target = keyTarget() === "player" ? this.el : document, $active = signal(false);
    if (target === this.el) {
      new EventsController(this.el).add("focusin", () => $active.set(true)).add("focusout", (event) => {
        if (!this.el.contains(event.target)) $active.set(false);
      });
    } else {
      if (!peek($active)) $active.set(document.querySelector("[data-media-player]") === this.el);
      listenEvent(document, "focusin", (event) => {
        const activePlayer = event.composedPath().find((el) => el instanceof Element && el.localName === "media-player");
        if (activePlayer !== void 0) $active.set(this.el === activePlayer);
      });
    }
    effect(() => {
      if (!$active()) return;
      new EventsController(target).add("keyup", this.#onKeyUp.bind(this)).add("keydown", this.#onKeyDown.bind(this)).add("keydown", this.#onPreventVideoKeys.bind(this), { capture: true });
    });
  }
  #onKeyUp(event) {
    const focusedEl = document.activeElement;
    if (!event.key || !this.$state.canSeek() || focusedEl?.matches(IGNORE_SELECTORS)) {
      return;
    }
    let { method, value } = this.#getMatchingMethod(event);
    if (!isString(value) && !isArray$1(value)) {
      value?.onKeyUp?.({
        event,
        player: this.#media.player,
        remote: this.#media.remote
      });
      value?.callback?.(event, this.#media.remote);
      return;
    }
    if (method?.startsWith("seek")) {
      event.preventDefault();
      event.stopPropagation();
      if (this.#timeSlider) {
        this.#forwardTimeKeyboardEvent(event, method === "seekForward");
        this.#timeSlider = null;
      } else {
        this.#media.remote.seek(this.#seekTotal, event);
        this.#seekTotal = void 0;
      }
    }
    if (method?.startsWith("volume")) {
      const volumeSlider = this.el.querySelector("[data-media-volume-slider]");
      volumeSlider?.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: method === "volumeUp" ? "Up" : "Down",
          shiftKey: event.shiftKey,
          trigger: event
        })
      );
    }
  }
  #onKeyDown(event) {
    if (!event.key || MODIFIER_KEYS.has(event.key)) return;
    const focusedEl = document.activeElement;
    if (focusedEl?.matches(IGNORE_SELECTORS) || isKeyboardClick(event) && focusedEl?.matches(BUTTON_SELECTORS)) {
      return;
    }
    let { method, value } = this.#getMatchingMethod(event), isNumberPress = !event.metaKey && /^[0-9]$/.test(event.key);
    if (!isString(value) && !isArray$1(value) && !isNumberPress) {
      value?.onKeyDown?.({
        event,
        player: this.#media.player,
        remote: this.#media.remote
      });
      value?.callback?.(event, this.#media.remote);
      return;
    }
    if (!method && isNumberPress) {
      event.preventDefault();
      event.stopPropagation();
      this.#media.remote.seek(this.$state.duration() / 10 * Number(event.key), event);
      return;
    }
    if (!method) return;
    event.preventDefault();
    event.stopPropagation();
    switch (method) {
      case "seekForward":
      case "seekBackward":
        this.#seeking(event, method, method === "seekForward");
        break;
      case "volumeUp":
      case "volumeDown":
        const volumeSlider = this.el.querySelector("[data-media-volume-slider]");
        if (volumeSlider) {
          volumeSlider.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: method === "volumeUp" ? "Up" : "Down",
              shiftKey: event.shiftKey,
              trigger: event
            })
          );
        } else {
          const value2 = event.shiftKey ? 0.1 : 0.05;
          this.#media.remote.changeVolume(
            this.$state.volume() + (method === "volumeUp" ? +value2 : -value2),
            event
          );
        }
        break;
      case "toggleFullscreen":
        this.#media.remote.toggleFullscreen("prefer-media", event);
        break;
      case "speedUp":
      case "slowDown":
        const playbackRate = this.$state.playbackRate();
        this.#media.remote.changePlaybackRate(
          Math.max(0.25, Math.min(2, playbackRate + (method === "speedUp" ? 0.25 : -0.25))),
          event
        );
        break;
      default:
        this.#media.remote[method]?.(event);
    }
    this.$state.lastKeyboardAction.set({
      action: method,
      event
    });
  }
  #onPreventVideoKeys(event) {
    if (isHTMLMediaElement(event.target) && this.#getMatchingMethod(event).method) {
      event.preventDefault();
    }
  }
  #getMatchingMethod(event) {
    const keyShortcuts = {
      ...this.$props.keyShortcuts(),
      ...this.#media.ariaKeys
    };
    const method = Object.keys(keyShortcuts).find((method2) => {
      const value = keyShortcuts[method2], keys = isArray$1(value) ? value.join(" ") : isString(value) ? value : value?.keys;
      const combinations = (isArray$1(keys) ? keys : keys?.split(" "))?.map(
        (key) => replaceSymbolKeys(key).replace(/Control/g, "Ctrl").split("+")
      );
      return combinations?.some((combo) => {
        const modifierKeys = new Set(combo.filter((key) => MODIFIER_KEYS.has(key)));
        for (const modKey of MODIFIER_KEYS) {
          const modKeyProp = modKey.toLowerCase() + "Key";
          if (!modifierKeys.has(modKey) && event[modKeyProp]) {
            return false;
          }
        }
        return combo.every((key) => {
          return MODIFIER_KEYS.has(key) ? event[key.toLowerCase() + "Key"] : event.key === key.replace("Space", " ");
        });
      });
    });
    return {
      method,
      value: method ? keyShortcuts[method] : null
    };
  }
  #seekTotal;
  #calcSeekAmount(event, type) {
    const seekBy = event.shiftKey ? 10 : 5;
    return this.#seekTotal = Math.max(
      0,
      Math.min(
        (this.#seekTotal ?? this.$state.currentTime()) + (type === "seekForward" ? +seekBy : -seekBy),
        this.$state.duration()
      )
    );
  }
  #timeSlider = null;
  #forwardTimeKeyboardEvent(event, forward) {
    this.#timeSlider?.dispatchEvent(
      new KeyboardEvent(event.type, {
        key: !forward ? "Left" : "Right",
        shiftKey: event.shiftKey,
        trigger: event
      })
    );
  }
  #seeking(event, type, forward) {
    if (!this.$state.canSeek()) return;
    if (!this.#timeSlider) {
      this.#timeSlider = this.el.querySelector("[data-media-time-slider]");
    }
    if (this.#timeSlider) {
      this.#forwardTimeKeyboardEvent(event, forward);
    } else {
      this.#media.remote.seeking(this.#calcSeekAmount(event, type), event);
    }
  }
}
const SYMBOL_KEY_MAP = ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"];
function replaceSymbolKeys(key) {
  return key.replace(/Shift\+(\d)/g, (_, num) => SYMBOL_KEY_MAP[num - 1]);
}

const mediaPlayerProps = {
  artist: "",
  artwork: null,
  autoplay: false,
  autoPlay: false,
  clipStartTime: 0,
  clipEndTime: 0,
  controls: false,
  currentTime: 0,
  crossorigin: null,
  crossOrigin: null,
  duration: -1,
  fullscreenOrientation: "landscape",
  googleCast: {},
  load: "visible",
  posterLoad: "visible",
  logLevel: "warn" ,
  loop: false,
  muted: false,
  paused: true,
  playsinline: false,
  playsInline: false,
  playbackRate: 1,
  poster: "",
  preload: "metadata",
  preferNativeHLS: false,
  src: "",
  title: "",
  controlsDelay: 2e3,
  hideControlsOnMouseLeave: false,
  viewType: "unknown",
  streamType: "unknown",
  volume: 1,
  liveEdgeTolerance: 10,
  minLiveDVRWindow: 60,
  keyDisabled: false,
  keyTarget: "player",
  keyShortcuts: MEDIA_KEY_SHORTCUTS,
  storage: null
};

var key = {
  fullscreenEnabled: 0,
  fullscreenElement: 1,
  requestFullscreen: 2,
  exitFullscreen: 3,
  fullscreenchange: 4,
  fullscreenerror: 5,
  fullscreen: 6
};
var webkit = [
  "webkitFullscreenEnabled",
  "webkitFullscreenElement",
  "webkitRequestFullscreen",
  "webkitExitFullscreen",
  "webkitfullscreenchange",
  "webkitfullscreenerror",
  "-webkit-full-screen"
];
var moz = [
  "mozFullScreenEnabled",
  "mozFullScreenElement",
  "mozRequestFullScreen",
  "mozCancelFullScreen",
  "mozfullscreenchange",
  "mozfullscreenerror",
  "-moz-full-screen"
];
var ms$1 = [
  "msFullscreenEnabled",
  "msFullscreenElement",
  "msRequestFullscreen",
  "msExitFullscreen",
  "MSFullscreenChange",
  "MSFullscreenError",
  "-ms-fullscreen"
];
var document$1 = typeof window !== "undefined" && typeof window.document !== "undefined" ? window.document : {};
var vendor = "fullscreenEnabled" in document$1 && Object.keys(key) || webkit[0] in document$1 && webkit || moz[0] in document$1 && moz || ms$1[0] in document$1 && ms$1 || [];
var fscreen = {
  requestFullscreen: function(element) {
    return element[vendor[key.requestFullscreen]]();
  },
  requestFullscreenFunction: function(element) {
    return element[vendor[key.requestFullscreen]];
  },
  get exitFullscreen() {
    return document$1[vendor[key.exitFullscreen]].bind(document$1);
  },
  get fullscreenPseudoClass() {
    return ":" + vendor[key.fullscreen];
  },
  addEventListener: function(type, handler, options) {
    return document$1.addEventListener(vendor[key[type]], handler, options);
  },
  removeEventListener: function(type, handler, options) {
    return document$1.removeEventListener(vendor[key[type]], handler, options);
  },
  get fullscreenEnabled() {
    return Boolean(document$1[vendor[key.fullscreenEnabled]]);
  },
  set fullscreenEnabled(val) {
  },
  get fullscreenElement() {
    return document$1[vendor[key.fullscreenElement]];
  },
  set fullscreenElement(val) {
  },
  get onfullscreenchange() {
    return document$1[("on" + vendor[key.fullscreenchange]).toLowerCase()];
  },
  set onfullscreenchange(handler) {
    return document$1[("on" + vendor[key.fullscreenchange]).toLowerCase()] = handler;
  },
  get onfullscreenerror() {
    return document$1[("on" + vendor[key.fullscreenerror]).toLowerCase()];
  },
  set onfullscreenerror(handler) {
    return document$1[("on" + vendor[key.fullscreenerror]).toLowerCase()] = handler;
  }
};

const UA = navigator?.userAgent.toLowerCase() || "";
const IS_IOS = /iphone|ipad|ipod|ios|crios|fxios/i.test(UA);
const IS_IPHONE = /(iphone|ipod)/gi.test(navigator?.platform || "");
const IS_CHROME = !!window.chrome;
const IS_SAFARI = !!window.safari || IS_IOS;
function canOrientScreen() {
  return canRotateScreen() && isFunction(screen.orientation.unlock);
}
function canRotateScreen() {
  return !isUndefined(window.screen.orientation) && !isUndefined(window.screen.orientation.lock);
}
function canPlayAudioType(audio, type) {
  if (!audio) audio = document.createElement("audio");
  return audio.canPlayType(type).length > 0;
}
function canPlayVideoType(video, type) {
  if (!video) video = document.createElement("video");
  return video.canPlayType(type).length > 0;
}
function canPlayHLSNatively(video) {
  if (!video) video = document.createElement("video");
  return video.canPlayType("application/vnd.apple.mpegurl").length > 0;
}
function canUsePictureInPicture(video) {
  return !!document.pictureInPictureEnabled && !video?.disablePictureInPicture;
}
function canUseVideoPresentation(video) {
  return isFunction(video?.webkitSupportsPresentationMode) && isFunction(video?.webkitSetPresentationMode);
}
async function canChangeVolume() {
  const video = document.createElement("video");
  video.volume = 0.5;
  await waitTimeout(0);
  return video.volume === 0.5;
}
function getMediaSource() {
  return window?.ManagedMediaSource ?? window?.MediaSource ?? window?.WebKitMediaSource;
}
function getSourceBuffer() {
  return window?.SourceBuffer ?? window?.WebKitSourceBuffer;
}
function isHLSSupported() {
  const MediaSource = getMediaSource();
  if (isUndefined(MediaSource)) return false;
  const isTypeSupported = MediaSource && isFunction(MediaSource.isTypeSupported) && MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"');
  const SourceBuffer = getSourceBuffer();
  const isSourceBufferValid = isUndefined(SourceBuffer) || !isUndefined(SourceBuffer.prototype) && isFunction(SourceBuffer.prototype.appendBuffer) && isFunction(SourceBuffer.prototype.remove);
  return !!isTypeSupported && !!isSourceBufferValid;
}
function isDASHSupported() {
  return isHLSSupported();
}

class TimeRange {
  #ranges;
  get length() {
    return this.#ranges.length;
  }
  constructor(start, end) {
    if (isArray$1(start)) {
      this.#ranges = start;
    } else if (!isUndefined(start) && !isUndefined(end)) {
      this.#ranges = [[start, end]];
    } else {
      this.#ranges = [];
    }
  }
  start(index) {
    throwIfEmpty(this.#ranges.length);
    throwIfOutOfRange("start", index, this.#ranges.length - 1);
    return this.#ranges[index][0] ?? Infinity;
  }
  end(index) {
    throwIfEmpty(this.#ranges.length);
    throwIfOutOfRange("end", index, this.#ranges.length - 1);
    return this.#ranges[index][1] ?? Infinity;
  }
}
function getTimeRangesStart(range) {
  if (!range.length) return null;
  let min = range.start(0);
  for (let i = 1; i < range.length; i++) {
    const value = range.start(i);
    if (value < min) min = value;
  }
  return min;
}
function getTimeRangesEnd(range) {
  if (!range.length) return null;
  let max = range.end(0);
  for (let i = 1; i < range.length; i++) {
    const value = range.end(i);
    if (value > max) max = value;
  }
  return max;
}
function throwIfEmpty(length) {
  if (!length) throw new Error("`TimeRanges` object is empty." );
}
function throwIfOutOfRange(fnName, index, end) {
  if (!isNumber(index) || index < 0 || index > end) {
    throw new Error(
      `Failed to execute '${fnName}' on 'TimeRanges': The index provided (${index}) is non-numeric or out of bounds (0-${end}).`
    );
  }
}
function normalizeTimeIntervals(intervals) {
  if (intervals.length <= 1) {
    return intervals;
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let normalized = [], current = intervals[0];
  for (let i = 1; i < intervals.length; i++) {
    const next = intervals[i];
    if (current[1] >= next[0] - 1) {
      current = [current[0], Math.max(current[1], next[1])];
    } else {
      normalized.push(current);
      current = next;
    }
  }
  normalized.push(current);
  return normalized;
}
function updateTimeIntervals(intervals, interval, value) {
  let start = interval[0], end = interval[1];
  if (value < start) {
    return [value, -1];
  } else if (value === start) {
    return interval;
  } else if (start === -1) {
    interval[0] = value;
    return interval;
  } else if (value > start) {
    interval[1] = value;
    if (end === -1) intervals.push(interval);
  }
  normalizeTimeIntervals(intervals);
  return interval;
}

const AUDIO_EXTENSIONS = /\.(m4a|m4b|mp4a|mpga|mp2|mp2a|mp3|m2a|m3a|wav|weba|aac|oga|spx|flac)($|\?)/i;
const AUDIO_TYPES = /* @__PURE__ */ new Set([
  "audio/mpeg",
  "audio/ogg",
  "audio/3gp",
  "audio/mp3",
  "audio/webm",
  "audio/flac",
  "audio/m4a",
  "audio/m4b",
  "audio/mp4a",
  "audio/mp4"
]);
const VIDEO_EXTENSIONS = /\.(mp4|og[gv]|webm|mov|m4v)(#t=[,\d+]+)?($|\?)/i;
const VIDEO_TYPES = /* @__PURE__ */ new Set([
  "video/mp4",
  "video/webm",
  "video/3gp",
  "video/ogg",
  "video/avi",
  "video/mpeg"
]);
const HLS_VIDEO_EXTENSIONS = /\.(m3u8)($|\?)/i;
const DASH_VIDEO_EXTENSIONS = /\.(mpd)($|\?)/i;
const HLS_VIDEO_TYPES = /* @__PURE__ */ new Set([
  // Apple sanctioned
  "application/vnd.apple.mpegurl",
  // Apple sanctioned for backwards compatibility
  "audio/mpegurl",
  // Very common
  "audio/x-mpegurl",
  // Very common
  "application/x-mpegurl",
  // Included for completeness
  "video/x-mpegurl",
  "video/mpegurl",
  "application/mpegurl"
]);
const DASH_VIDEO_TYPES = /* @__PURE__ */ new Set(["application/dash+xml"]);
function isAudioSrc({ src, type }) {
  return isString(src) ? AUDIO_EXTENSIONS.test(src) || AUDIO_TYPES.has(type) || src.startsWith("blob:") && type === "audio/object" : type === "audio/object";
}
function isVideoSrc(src) {
  return isString(src.src) ? VIDEO_EXTENSIONS.test(src.src) || VIDEO_TYPES.has(src.type) || src.src.startsWith("blob:") && src.type === "video/object" || isHLSSrc(src) && canPlayHLSNatively() : src.type === "video/object";
}
function isHLSSrc({ src, type }) {
  return isString(src) && HLS_VIDEO_EXTENSIONS.test(src) || HLS_VIDEO_TYPES.has(type);
}
function isDASHSrc({ src, type }) {
  return isString(src) && DASH_VIDEO_EXTENSIONS.test(src) || DASH_VIDEO_TYPES.has(type);
}
function canGoogleCastSrc(src) {
  return isString(src.src) && (isAudioSrc(src) || isVideoSrc(src) || isHLSSrc(src));
}
function isMediaStream(src) {
  return typeof window.MediaStream !== "undefined" && src instanceof window.MediaStream;
}

function appendParamsToURL(baseUrl, params) {
  const url = new URL(baseUrl);
  for (const key of Object.keys(params)) {
    url.searchParams.set(key, params[key] + "");
  }
  return url.toString();
}
function preconnect(url, rel = "preconnect") {
  const exists = document.querySelector(`link[href="${url}"]`);
  if (!isNull(exists)) return true;
  const link = document.createElement("link");
  link.rel = rel;
  link.href = url;
  link.crossOrigin = "true";
  document.head.append(link);
  return true;
}
const pendingRequests = {};
function loadScript(src) {
  if (pendingRequests[src]) return pendingRequests[src].promise;
  const promise = deferredPromise(), exists = document.querySelector(`script[src="${src}"]`);
  if (!isNull(exists)) {
    promise.resolve();
    return promise.promise;
  }
  pendingRequests[src] = promise;
  const script = document.createElement("script");
  script.src = src;
  script.onload = () => {
    promise.resolve();
    delete pendingRequests[src];
  };
  script.onerror = () => {
    promise.reject();
    delete pendingRequests[src];
  };
  setTimeout(() => document.head.append(script), 0);
  return promise.promise;
}
function getRequestCredentials(crossOrigin) {
  return crossOrigin === "use-credentials" ? "include" : isString(crossOrigin) ? "same-origin" : void 0;
}
function getDownloadFile({
  title,
  src,
  download
}) {
  const url = isBoolean(download) || download === "" ? src.src : isString(download) ? download : download?.url;
  if (!isValidFileDownload({ url, src, download })) return null;
  return {
    url,
    name: !isBoolean(download) && !isString(download) && download?.filename || title.toLowerCase() || "media"
  };
}
function isValidFileDownload({
  url,
  src,
  download
}) {
  return isString(url) && (download && download !== true || isAudioSrc(src) || isVideoSrc(src));
}

const CROSS_ORIGIN = Symbol("TEXT_TRACK_CROSS_ORIGIN" ), READY_STATE = Symbol("TEXT_TRACK_READY_STATE" ), UPDATE_ACTIVE_CUES = Symbol("TEXT_TRACK_UPDATE_ACTIVE_CUES" ), CAN_LOAD = Symbol("TEXT_TRACK_CAN_LOAD" ), ON_MODE_CHANGE = Symbol("TEXT_TRACK_ON_MODE_CHANGE" ), NATIVE = Symbol("TEXT_TRACK_NATIVE" ), NATIVE_HLS = Symbol("TEXT_TRACK_NATIVE_HLS" );
const TextTrackSymbol = {
  crossOrigin: CROSS_ORIGIN,
  readyState: READY_STATE,
  updateActiveCues: UPDATE_ACTIVE_CUES,
  canLoad: CAN_LOAD,
  onModeChange: ON_MODE_CHANGE,
  native: NATIVE,
  nativeHLS: NATIVE_HLS
};

function findActiveCue(cues, time) {
  for (let i = 0, len = cues.length; i < len; i++) {
    if (isCueActive(cues[i], time)) return cues[i];
  }
  return null;
}
function isCueActive(cue, time) {
  return time >= cue.startTime && time < cue.endTime;
}
function watchActiveTextTrack(tracks, kind, onChange) {
  let currentTrack = null, scope = getScope();
  function onModeChange() {
    const kinds = isString(kind) ? [kind] : kind, track = tracks.toArray().find((track2) => kinds.includes(track2.kind) && track2.mode === "showing");
    if (track === currentTrack) return;
    if (!track) {
      onChange(null);
      currentTrack = null;
      return;
    }
    if (track.readyState == 2) {
      onChange(track);
    } else {
      onChange(null);
      scoped(() => {
        const off = listenEvent(
          track,
          "load",
          () => {
            onChange(track);
            off();
          },
          { once: true }
        );
      }, scope);
    }
    currentTrack = track;
  }
  onModeChange();
  return listenEvent(tracks, "mode-change", onModeChange);
}
function watchCueTextChange(tracks, kind, callback) {
  watchActiveTextTrack(tracks, kind, (track) => {
    if (!track) {
      callback("");
      return;
    }
    const onCueChange = () => {
      const activeCue = track?.activeCues[0];
      callback(activeCue?.text || "");
    };
    onCueChange();
    listenEvent(track, "cue-change", onCueChange);
  });
}

class TextTrack extends EventsTarget {
  static createId(track) {
    return `vds-${track.type}-${track.kind}-${track.src ?? track.label ?? "?"}`;
  }
  src;
  content;
  type;
  encoding;
  id = "";
  label = "";
  language = "";
  kind;
  default = false;
  #canLoad = false;
  #currentTime = 0;
  #mode = "disabled";
  #metadata = {};
  #regions = [];
  #cues = [];
  #activeCues = [];
  /** @internal */
  [TextTrackSymbol.readyState] = 0;
  /** @internal */
  [TextTrackSymbol.crossOrigin];
  /** @internal */
  [TextTrackSymbol.onModeChange] = null;
  /** @internal */
  [TextTrackSymbol.native] = null;
  get metadata() {
    return this.#metadata;
  }
  get regions() {
    return this.#regions;
  }
  get cues() {
    return this.#cues;
  }
  get activeCues() {
    return this.#activeCues;
  }
  /**
   * - 0: Not Loading
   * - 1: Loading
   * - 2: Ready
   * - 3: Error
   */
  get readyState() {
    return this[TextTrackSymbol.readyState];
  }
  get mode() {
    return this.#mode;
  }
  set mode(mode) {
    this.setMode(mode);
  }
  constructor(init) {
    super();
    for (const prop of Object.keys(init)) this[prop] = init[prop];
    if (!this.type) this.type = "vtt";
    if (init.content) {
      this.#parseContent(init);
    } else if (!init.src) {
      this[TextTrackSymbol.readyState] = 2;
    }
    if (isTrackCaptionKind(this) && !this.label) {
      console.warn(`[vidstack] captions text track created without label: \`${this.src}\``);
    }
  }
  addCue(cue, trigger) {
    let i = 0, length = this.#cues.length;
    for (i = 0; i < length; i++) if (cue.endTime <= this.#cues[i].startTime) break;
    if (i === length) this.#cues.push(cue);
    else this.#cues.splice(i, 0, cue);
    if (!(cue instanceof TextTrackCue)) {
      this[TextTrackSymbol.native]?.track.addCue(cue);
    }
    this.dispatchEvent(new DOMEvent("add-cue", { detail: cue, trigger }));
    if (isCueActive(cue, this.#currentTime)) {
      this[TextTrackSymbol.updateActiveCues](this.#currentTime, trigger);
    }
  }
  removeCue(cue, trigger) {
    const index = this.#cues.indexOf(cue);
    if (index >= 0) {
      const isActive = this.#activeCues.includes(cue);
      this.#cues.splice(index, 1);
      this[TextTrackSymbol.native]?.track.removeCue(cue);
      this.dispatchEvent(new DOMEvent("remove-cue", { detail: cue, trigger }));
      if (isActive) {
        this[TextTrackSymbol.updateActiveCues](this.#currentTime, trigger);
      }
    }
  }
  setMode(mode, trigger) {
    if (this.#mode === mode) return;
    this.#mode = mode;
    if (mode === "disabled") {
      this.#activeCues = [];
      this.#activeCuesChanged();
    } else if (this.readyState === 2) {
      this[TextTrackSymbol.updateActiveCues](this.#currentTime, trigger);
    } else {
      this.#load();
    }
    this.dispatchEvent(new DOMEvent("mode-change", { detail: this, trigger }));
    this[TextTrackSymbol.onModeChange]?.();
  }
  /** @internal */
  [TextTrackSymbol.updateActiveCues](currentTime, trigger) {
    this.#currentTime = currentTime;
    if (this.mode === "disabled" || !this.#cues.length) return;
    const activeCues = [];
    for (let i = 0, length = this.#cues.length; i < length; i++) {
      const cue = this.#cues[i];
      if (isCueActive(cue, currentTime)) activeCues.push(cue);
    }
    let changed = activeCues.length !== this.#activeCues.length;
    if (!changed) {
      for (let i = 0; i < activeCues.length; i++) {
        if (!this.#activeCues.includes(activeCues[i])) {
          changed = true;
          break;
        }
      }
    }
    this.#activeCues = activeCues;
    if (changed) this.#activeCuesChanged(trigger);
  }
  /** @internal */
  [TextTrackSymbol.canLoad]() {
    this.#canLoad = true;
    if (this.#mode !== "disabled") this.#load();
  }
  #parseContent(init) {
    import('https://cdn.vidstack.io/captions').then(({ parseText, VTTCue, VTTRegion }) => {
      if (!isString(init.content) || init.type === "json") {
        this.#parseJSON(init.content, VTTCue, VTTRegion);
        if (this.readyState !== 3) this.#ready();
      } else {
        parseText(init.content, { type: init.type }).then(({ cues, regions }) => {
          this.#cues = cues;
          this.#regions = regions;
          this.#ready();
        });
      }
    });
  }
  async #load() {
    if (!this.#canLoad || this[TextTrackSymbol.readyState] > 0) return;
    this[TextTrackSymbol.readyState] = 1;
    this.dispatchEvent(new DOMEvent("load-start"));
    if (!this.src) {
      this.#ready();
      return;
    }
    try {
      const { parseResponse, VTTCue, VTTRegion } = await import('https://cdn.vidstack.io/captions'), crossOrigin = this[TextTrackSymbol.crossOrigin]?.();
      const response = fetch(this.src, {
        headers: this.type === "json" ? { "Content-Type": "application/json" } : void 0,
        credentials: getRequestCredentials(crossOrigin)
      });
      if (this.type === "json") {
        this.#parseJSON(await (await response).text(), VTTCue, VTTRegion);
      } else {
        const { errors, metadata, regions, cues } = await parseResponse(response, {
          type: this.type,
          encoding: this.encoding
        });
        if (errors[0]?.code === 0) {
          throw errors[0];
        } else {
          this.#metadata = metadata;
          this.#regions = regions;
          this.#cues = cues;
        }
      }
      this.#ready();
    } catch (error) {
      this.#error(error);
    }
  }
  #ready() {
    this[TextTrackSymbol.readyState] = 2;
    if (!this.src || this.type !== "vtt") {
      const native = this[TextTrackSymbol.native];
      if (native && !native.managed) {
        for (const cue of this.#cues) native.track.addCue(cue);
      }
    }
    const loadEvent = new DOMEvent("load");
    this[TextTrackSymbol.updateActiveCues](this.#currentTime, loadEvent);
    this.dispatchEvent(loadEvent);
  }
  #error(error) {
    this[TextTrackSymbol.readyState] = 3;
    this.dispatchEvent(new DOMEvent("error", { detail: error }));
  }
  #parseJSON(json, VTTCue, VTTRegion) {
    try {
      const { regions, cues } = parseJSONCaptionsFile(json, VTTCue, VTTRegion);
      this.#regions = regions;
      this.#cues = cues;
    } catch (error) {
      {
        console.error(`[vidstack] failed to parse JSON captions at: \`${this.src}\`

`, error);
      }
      this.#error(error);
    }
  }
  #activeCuesChanged(trigger) {
    this.dispatchEvent(new DOMEvent("cue-change", { trigger }));
  }
}
const captionRE = /captions|subtitles/;
function isTrackCaptionKind(track) {
  return captionRE.test(track.kind);
}
function parseJSONCaptionsFile(json, Cue, Region) {
  const content = isString(json) ? JSON.parse(json) : json;
  let regions = [], cues = [];
  if (content.regions && Region) {
    regions = content.regions.map((region) => Object.assign(new Region(), region));
  }
  if (content.cues || isArray$1(content)) {
    cues = (isArray$1(content) ? content : content.cues).filter((content2) => isNumber(content2.startTime) && isNumber(content2.endTime)).map((cue) => Object.assign(new Cue(0, 0, ""), cue));
  }
  return { regions, cues };
}

const mediaState = new State({
  artist: "",
  artwork: null,
  audioTrack: null,
  audioTracks: [],
  autoPlay: false,
  autoPlayError: null,
  audioGain: null,
  buffered: new TimeRange(),
  canLoad: false,
  canLoadPoster: false,
  canFullscreen: false,
  canOrientScreen: canOrientScreen(),
  canPictureInPicture: false,
  canPlay: false,
  clipStartTime: 0,
  clipEndTime: 0,
  controls: false,
  get iOSControls() {
    return IS_IPHONE && this.mediaType === "video" && (!this.playsInline || !fscreen.fullscreenEnabled && this.fullscreen);
  },
  get nativeControls() {
    return this.controls || this.iOSControls;
  },
  controlsVisible: false,
  get controlsHidden() {
    return !this.controlsVisible;
  },
  crossOrigin: null,
  ended: false,
  error: null,
  fullscreen: false,
  get loop() {
    return this.providedLoop || this.userPrefersLoop;
  },
  logLevel: "warn" ,
  mediaType: "unknown",
  muted: false,
  paused: true,
  played: new TimeRange(),
  playing: false,
  playsInline: false,
  pictureInPicture: false,
  preload: "metadata",
  playbackRate: 1,
  qualities: [],
  quality: null,
  autoQuality: false,
  canSetQuality: true,
  canSetPlaybackRate: true,
  canSetVolume: false,
  canSetAudioGain: false,
  seekable: new TimeRange(),
  seeking: false,
  source: { src: "", type: "" },
  sources: [],
  started: false,
  textTracks: [],
  textTrack: null,
  get hasCaptions() {
    return this.textTracks.filter(isTrackCaptionKind).length > 0;
  },
  volume: 1,
  waiting: false,
  realCurrentTime: 0,
  get currentTime() {
    return this.ended ? this.duration : this.clipStartTime > 0 ? Math.max(0, Math.min(this.realCurrentTime - this.clipStartTime, this.duration)) : this.realCurrentTime;
  },
  providedDuration: -1,
  intrinsicDuration: 0,
  get duration() {
    return this.seekableWindow;
  },
  get title() {
    return this.providedTitle || this.inferredTitle;
  },
  get poster() {
    return this.providedPoster || this.inferredPoster;
  },
  get viewType() {
    return this.providedViewType !== "unknown" ? this.providedViewType : this.inferredViewType;
  },
  get streamType() {
    return this.providedStreamType !== "unknown" ? this.providedStreamType : this.inferredStreamType;
  },
  get currentSrc() {
    return this.source;
  },
  get bufferedStart() {
    const start = getTimeRangesStart(this.buffered) ?? 0;
    return Math.max(start, this.clipStartTime);
  },
  get bufferedEnd() {
    const end = getTimeRangesEnd(this.buffered) ?? 0;
    return Math.min(this.seekableEnd, Math.max(0, end - this.clipStartTime));
  },
  get bufferedWindow() {
    return Math.max(0, this.bufferedEnd - this.bufferedStart);
  },
  get seekableStart() {
    if (this.isLiveDVR && this.liveDVRWindow > 0) {
      return Math.max(0, this.seekableEnd - this.liveDVRWindow);
    }
    const start = getTimeRangesStart(this.seekable) ?? 0;
    return Math.max(start, this.clipStartTime);
  },
  get seekableEnd() {
    if (this.providedDuration > 0) return this.providedDuration;
    const end = this.liveSyncPosition > 0 ? this.liveSyncPosition : this.canPlay ? getTimeRangesEnd(this.seekable) ?? Infinity : 0;
    return this.clipEndTime > 0 ? Math.min(this.clipEndTime, end) : end;
  },
  get seekableWindow() {
    const window = this.seekableEnd - this.seekableStart;
    return !isNaN(window) ? Math.max(0, window) : Infinity;
  },
  // ~~ remote playback ~~
  canAirPlay: false,
  canGoogleCast: false,
  remotePlaybackState: "disconnected",
  remotePlaybackType: "none",
  remotePlaybackLoader: null,
  remotePlaybackInfo: null,
  get isAirPlayConnected() {
    return this.remotePlaybackType === "airplay" && this.remotePlaybackState === "connected";
  },
  get isGoogleCastConnected() {
    return this.remotePlaybackType === "google-cast" && this.remotePlaybackState === "connected";
  },
  // ~~ responsive design ~~
  pointer: "fine",
  orientation: "landscape",
  width: 0,
  height: 0,
  mediaWidth: 0,
  mediaHeight: 0,
  lastKeyboardAction: null,
  // ~~ user props ~~
  userBehindLiveEdge: false,
  // ~~ live props ~~
  liveEdgeTolerance: 10,
  minLiveDVRWindow: 60,
  get canSeek() {
    return /unknown|on-demand|:dvr/.test(this.streamType) && Number.isFinite(this.duration) && (!this.isLiveDVR || this.duration >= this.liveDVRWindow);
  },
  get live() {
    return this.streamType.includes("live") || !Number.isFinite(this.duration);
  },
  get liveEdgeStart() {
    return this.live && Number.isFinite(this.seekableEnd) ? Math.max(0, this.seekableEnd - this.liveEdgeTolerance) : 0;
  },
  get liveEdge() {
    return this.live && (!this.canSeek || !this.userBehindLiveEdge && this.currentTime >= this.liveEdgeStart);
  },
  get liveEdgeWindow() {
    return this.live && Number.isFinite(this.seekableEnd) ? this.seekableEnd - this.liveEdgeStart : 0;
  },
  get isLiveDVR() {
    return /:dvr/.test(this.streamType);
  },
  get liveDVRWindow() {
    return Math.max(this.inferredLiveDVRWindow, this.minLiveDVRWindow);
  },
  // ~~ internal props ~~
  autoPlaying: false,
  providedTitle: "",
  inferredTitle: "",
  providedLoop: false,
  userPrefersLoop: false,
  providedPoster: "",
  inferredPoster: "",
  inferredViewType: "unknown",
  providedViewType: "unknown",
  providedStreamType: "unknown",
  inferredStreamType: "unknown",
  liveSyncPosition: null,
  inferredLiveDVRWindow: 0,
  savedState: null
});
const RESET_ON_SRC_QUALITY_CHANGE = /* @__PURE__ */ new Set([
  "autoPlayError",
  "autoPlaying",
  "buffered",
  "canPlay",
  "error",
  "paused",
  "played",
  "playing",
  "seekable",
  "seeking",
  "waiting"
]);
const RESET_ON_SRC_CHANGE = /* @__PURE__ */ new Set([
  ...RESET_ON_SRC_QUALITY_CHANGE,
  "ended",
  "inferredPoster",
  "inferredStreamType",
  "inferredTitle",
  "intrinsicDuration",
  "inferredLiveDVRWindow",
  "liveSyncPosition",
  "realCurrentTime",
  "savedState",
  "started",
  "userBehindLiveEdge"
]);
function softResetMediaState($media, isSourceQualityChange = false) {
  const filter = isSourceQualityChange ? RESET_ON_SRC_QUALITY_CHANGE : RESET_ON_SRC_CHANGE;
  mediaState.reset($media, (prop) => filter.has(prop));
  tick();
}
function boundTime(time, store) {
  const clippedTime = time + store.clipStartTime(), isStart = Math.floor(time) === Math.floor(store.seekableStart()), isEnd = Math.floor(clippedTime) === Math.floor(store.seekableEnd());
  if (isStart) {
    return store.seekableStart();
  }
  if (isEnd) {
    return store.seekableEnd();
  }
  if (store.isLiveDVR() && store.liveDVRWindow() > 0 && clippedTime < store.seekableEnd() - store.liveDVRWindow()) {
    return store.bufferedStart();
  }
  return Math.min(Math.max(store.seekableStart() + 0.1, clippedTime), store.seekableEnd() - 0.1);
}

const ADD = Symbol("LIST_ADD" ), REMOVE = Symbol("LIST_REMOVE" ), RESET = Symbol("LIST_RESET" ), SELECT = Symbol("LIST_SELECT" ), READONLY = Symbol("LIST_READONLY" ), SET_READONLY = Symbol("LIST_SET_READONLY" ), ON_RESET = Symbol("LIST_ON_RESET" ), ON_REMOVE = Symbol("LIST_ON_REMOVE" ), ON_USER_SELECT = Symbol("LIST_ON_USER_SELECT" );
const ListSymbol = {
  add: ADD,
  remove: REMOVE,
  reset: RESET,
  select: SELECT,
  readonly: READONLY,
  setReadonly: SET_READONLY,
  onReset: ON_RESET,
  onRemove: ON_REMOVE,
  onUserSelect: ON_USER_SELECT
};

class List extends EventsTarget {
  items = [];
  /** @internal */
  [ListSymbol.readonly] = false;
  get length() {
    return this.items.length;
  }
  get readonly() {
    return this[ListSymbol.readonly];
  }
  /**
   * Returns the index of the first occurrence of the given item, or -1 if it is not present.
   */
  indexOf(item) {
    return this.items.indexOf(item);
  }
  /**
   * Returns an item matching the given `id`, or `null` if not present.
   */
  getById(id) {
    if (id === "") return null;
    return this.items.find((item) => item.id === id) ?? null;
  }
  /**
   * Transform list to an array.
   */
  toArray() {
    return [...this.items];
  }
  [Symbol.iterator]() {
    return this.items.values();
  }
  /** @internal */
  [ListSymbol.add](item, trigger) {
    const index = this.items.length;
    if (!("" + index in this)) {
      Object.defineProperty(this, index, {
        get() {
          return this.items[index];
        }
      });
    }
    if (this.items.includes(item)) return;
    this.items.push(item);
    this.dispatchEvent(new DOMEvent("add", { detail: item, trigger }));
  }
  /** @internal */
  [ListSymbol.remove](item, trigger) {
    const index = this.items.indexOf(item);
    if (index >= 0) {
      this[ListSymbol.onRemove]?.(item, trigger);
      this.items.splice(index, 1);
      this.dispatchEvent(new DOMEvent("remove", { detail: item, trigger }));
    }
  }
  /** @internal */
  [ListSymbol.reset](trigger) {
    for (const item of [...this.items]) this[ListSymbol.remove](item, trigger);
    this.items = [];
    this[ListSymbol.setReadonly](false, trigger);
    this[ListSymbol.onReset]?.();
  }
  /** @internal */
  [ListSymbol.setReadonly](readonly, trigger) {
    if (this[ListSymbol.readonly] === readonly) return;
    this[ListSymbol.readonly] = readonly;
    this.dispatchEvent(new DOMEvent("readonly-change", { detail: readonly, trigger }));
  }
}

const SELECTED = Symbol("SELECTED" );
class SelectList extends List {
  get selected() {
    return this.items.find((item) => item.selected) ?? null;
  }
  get selectedIndex() {
    return this.items.findIndex((item) => item.selected);
  }
  /** @internal */
  [ListSymbol.onRemove](item, trigger) {
    this[ListSymbol.select](item, false, trigger);
  }
  /** @internal */
  [ListSymbol.add](item, trigger) {
    item[SELECTED] = false;
    Object.defineProperty(item, "selected", {
      get() {
        return this[SELECTED];
      },
      set: (selected) => {
        if (this.readonly) return;
        this[ListSymbol.onUserSelect]?.();
        this[ListSymbol.select](item, selected);
      }
    });
    super[ListSymbol.add](item, trigger);
  }
  /** @internal */
  [ListSymbol.select](item, selected, trigger) {
    if (selected === item?.[SELECTED]) return;
    const prev = this.selected;
    if (item) item[SELECTED] = selected;
    const changed = !selected ? prev === item : prev !== item;
    if (changed) {
      if (prev) prev[SELECTED] = false;
      this.dispatchEvent(
        new DOMEvent("change", {
          detail: {
            prev,
            current: this.selected
          },
          trigger
        })
      );
    }
  }
}

const SET_AUTO = Symbol("SET_AUTO_QUALITY" ), ENABLE_AUTO = Symbol("ENABLE_AUTO_QUALITY" );
const QualitySymbol = {
  setAuto: SET_AUTO,
  enableAuto: ENABLE_AUTO
};

class VideoQualityList extends SelectList {
  #auto = false;
  /**
   * Configures quality switching:
   *
   * - `current`: Trigger an immediate quality level switch. This will abort the current fragment
   * request if any, flush the whole buffer, and fetch fragment matching with current position
   * and requested quality level.
   *
   * - `next`: Trigger a quality level switch for next fragment. This could eventually flush
   * already buffered next fragment.
   *
   * - `load`: Set quality level for next loaded fragment.
   *
   * @see {@link https://www.vidstack.io/docs/player/api/video-quality#switch}
   * @see {@link https://github.com/video-dev/hls.js/blob/master/docs/API.md#quality-switch-control-api}
   */
  switch = "current";
  /**
   * Whether automatic quality selection is enabled.
   */
  get auto() {
    return this.#auto || this.readonly;
  }
  /** @internal */
  [QualitySymbol.enableAuto];
  /** @internal */
  [ListSymbol.onUserSelect]() {
    this[QualitySymbol.setAuto](false);
  }
  /** @internal */
  [ListSymbol.onReset](trigger) {
    this[QualitySymbol.enableAuto] = void 0;
    this[QualitySymbol.setAuto](false, trigger);
  }
  /**
   * Request automatic quality selection (if supported). This will be a no-op if the list is
   * `readonly` as that already implies auto-selection.
   */
  autoSelect(trigger) {
    if (this.readonly || this.#auto || !this[QualitySymbol.enableAuto]) return;
    this[QualitySymbol.enableAuto]?.(trigger);
    this[QualitySymbol.setAuto](true, trigger);
  }
  getBySrc(src) {
    return this.items.find((quality) => quality.src === src);
  }
  /** @internal */
  [QualitySymbol.setAuto](auto, trigger) {
    if (this.#auto === auto) return;
    this.#auto = auto;
    this.dispatchEvent(
      new DOMEvent("auto-change", {
        detail: auto,
        trigger
      })
    );
  }
}

const MEDIA_EVENTS = [
  "abort",
  "can-play",
  "can-play-through",
  "duration-change",
  "emptied",
  "ended",
  "error",
  "fullscreen-change",
  "loaded-data",
  "loaded-metadata",
  "load-start",
  "media-type-change",
  "pause",
  "play",
  "playing",
  "progress",
  "seeked",
  "seeking",
  "source-change",
  "sources-change",
  "stalled",
  "started",
  "suspend",
  "stream-type-change",
  "replay",
  // time-change,
  // 'time-update',
  "view-type-change",
  "volume-change",
  "waiting"
] ;
class MediaEventsLogger extends MediaPlayerController {
  #media;
  constructor(media) {
    super();
    this.#media = media;
  }
  onConnect(el) {
    const events = new EventsController(el), handler = this.#onMediaEvent.bind(this);
    for (const eventType of MEDIA_EVENTS) {
      events.add(eventType, handler);
    }
  }
  #onMediaEvent(event) {
    this.#media.logger?.debugGroup(`\u{1F4E1} dispatching \`${event.type}\``).labelledLog("Media Store", { ...this.$state }).labelledLog("Event", event).dispatch();
  }
}

class MediaLoadController extends MediaPlayerController {
  #type;
  #callback;
  constructor(type, callback) {
    super();
    this.#type = type;
    this.#callback = callback;
  }
  async onAttach(el) {
    const load = this.$props[this.#type]();
    if (load === "eager") {
      requestAnimationFrame(this.#callback);
    } else if (load === "idle") {
      waitIdlePeriod(this.#callback);
    } else if (load === "visible") {
      let dispose, observer = new IntersectionObserver((entries) => {
        if (!this.scope) return;
        if (entries[0].isIntersecting) {
          dispose?.();
          dispose = void 0;
          this.#callback();
        }
      });
      observer.observe(el);
      dispose = onDispose(() => observer.disconnect());
    }
  }
}

let seenAutoplayWarning = false;
class MediaPlayerDelegate {
  #handle;
  #media;
  constructor(handle, media) {
    this.#handle = handle;
    this.#media = media;
  }
  notify(type, ...init) {
    this.#handle(
      new DOMEvent(type, {
        detail: init?.[0],
        trigger: init?.[1]
      })
    );
  }
  async ready(info, trigger) {
    return untrack(async () => {
      const { logger } = this.#media, {
        autoPlay,
        canPlay,
        started,
        duration,
        seekable,
        buffered,
        remotePlaybackInfo,
        playsInline,
        savedState,
        source
      } = this.#media.$state;
      if (canPlay()) return;
      const detail = {
        duration: info?.duration ?? duration(),
        seekable: info?.seekable ?? seekable(),
        buffered: info?.buffered ?? buffered(),
        provider: this.#media.$provider()
      };
      this.notify("can-play", detail, trigger);
      tick();
      {
        logger?.infoGroup("-~-~-~-~-~-~- \u2705 MEDIA READY -~-~-~-~-~-~-").labelledLog("Media", this.#media).labelledLog("Trigger Event", trigger).dispatch();
      }
      let provider = this.#media.$provider(), { storage, qualities } = this.#media, { muted, volume, clipStartTime, playbackRate } = this.#media.$props;
      await storage?.onLoad?.(source());
      const savedPlaybackTime = savedState()?.currentTime, savedPausedState = savedState()?.paused, storageTime = await storage?.getTime(), startTime = savedPlaybackTime ?? storageTime ?? clipStartTime(), shouldAutoPlay = savedPausedState === false || savedPausedState !== true && !started() && autoPlay();
      if (provider) {
        provider.setVolume(await storage?.getVolume() ?? volume());
        provider.setMuted(muted() || !!await storage?.getMuted());
        const audioGain = await storage?.getAudioGain() ?? 1;
        if (audioGain > 1) provider.audioGain?.setGain?.(audioGain);
        provider.setPlaybackRate?.(await storage?.getPlaybackRate() ?? playbackRate());
        provider.setPlaysInline?.(playsInline());
        if (startTime > 0) provider.setCurrentTime(startTime);
      }
      const prefQuality = await storage?.getVideoQuality();
      if (prefQuality && qualities.length) {
        let currentQuality = null, currentScore = Infinity;
        for (const quality of qualities) {
          const score = Math.abs(prefQuality.width - quality.width) + Math.abs(prefQuality.height - quality.height) + (prefQuality.bitrate ? Math.abs(prefQuality.bitrate - (quality.bitrate ?? 0)) : 0);
          if (score < currentScore) {
            currentQuality = quality;
            currentScore = score;
          }
        }
        if (currentQuality) currentQuality.selected = true;
      }
      if (canPlay() && shouldAutoPlay) {
        await this.#attemptAutoplay(trigger);
      } else if (storageTime && storageTime > 0) {
        this.notify("started", void 0, trigger);
      }
      remotePlaybackInfo.set(null);
    });
  }
  async #attemptAutoplay(trigger) {
    const {
      player,
      $state: { autoPlaying, muted }
    } = this.#media;
    autoPlaying.set(true);
    const attemptEvent = new DOMEvent("auto-play-attempt", { trigger });
    try {
      await player.play(attemptEvent);
    } catch (error) {
      if (!seenAutoplayWarning) {
        const muteMsg = !muted() ? " Attempting with volume muted will most likely resolve the issue." : "";
        this.#media.logger?.errorGroup("[vidstack] auto-play request failed").labelledLog(
          "Message",
          `Autoplay was requested but failed most likely due to browser autoplay policies.${muteMsg}`
        ).labelledLog("Trigger Event", trigger).labelledLog("Error", error).labelledLog("See", "https://developer.chrome.com/blog/autoplay").dispatch();
        seenAutoplayWarning = true;
      }
    }
  }
}

const CAN_FULLSCREEN = fscreen.fullscreenEnabled;
class FullscreenController extends ViewController {
  /**
   * Tracks whether we're the active fullscreen event listener. Fullscreen events can only be
   * listened to globally on the document so we need to know if they relate to the current host
   * element or not.
   */
  #listening = false;
  #active = false;
  get active() {
    return this.#active;
  }
  get supported() {
    return CAN_FULLSCREEN;
  }
  onConnect() {
    new EventsController(fscreen).add("fullscreenchange", this.#onChange.bind(this)).add("fullscreenerror", this.#onError.bind(this));
    onDispose(this.#onDisconnect.bind(this));
  }
  async #onDisconnect() {
    if (CAN_FULLSCREEN) await this.exit();
  }
  #onChange(event) {
    const active = isFullscreen(this.el);
    if (active === this.#active) return;
    if (!active) this.#listening = false;
    this.#active = active;
    this.dispatch("fullscreen-change", { detail: active, trigger: event });
  }
  #onError(event) {
    if (!this.#listening) return;
    this.dispatch("fullscreen-error", { detail: null, trigger: event });
    this.#listening = false;
  }
  async enter() {
    try {
      this.#listening = true;
      if (!this.el || isFullscreen(this.el)) return;
      assertFullscreenAPI();
      return fscreen.requestFullscreen(this.el);
    } catch (error) {
      this.#listening = false;
      throw error;
    }
  }
  async exit() {
    if (!this.el || !isFullscreen(this.el)) return;
    assertFullscreenAPI();
    return fscreen.exitFullscreen();
  }
}
function isFullscreen(host) {
  if (fscreen.fullscreenElement === host) return true;
  try {
    return host.matches(
      // @ts-expect-error - `fullscreenPseudoClass` is missing from `@types/fscreen`.
      fscreen.fullscreenPseudoClass
    );
  } catch (error) {
    return false;
  }
}
function assertFullscreenAPI() {
  if (CAN_FULLSCREEN) return;
  throw Error(
    "[vidstack] fullscreen API is not enabled or supported in this environment" 
  );
}

class ScreenOrientationController extends ViewController {
  #type = signal(this.#getScreenOrientation());
  #locked = signal(false);
  #currentLock;
  /**
   * The current screen orientation type.
   *
   * @signal
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation}
   * @see https://w3c.github.io/screen-orientation/#screen-orientation-types-and-locks
   */
  get type() {
    return this.#type();
  }
  /**
   * Whether the screen orientation is currently locked.
   *
   * @signal
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation}
   * @see https://w3c.github.io/screen-orientation/#screen-orientation-types-and-locks
   */
  get locked() {
    return this.#locked();
  }
  /**
   * Whether the viewport is in a portrait orientation.
   *
   * @signal
   */
  get portrait() {
    return this.#type().startsWith("portrait");
  }
  /**
   * Whether the viewport is in a landscape orientation.
   *
   * @signal
   */
  get landscape() {
    return this.#type().startsWith("landscape");
  }
  /**
   * Whether the native Screen Orientation API is available.
   */
  static supported = canOrientScreen();
  /**
   * Whether the native Screen Orientation API is available.
   */
  get supported() {
    return ScreenOrientationController.supported;
  }
  onConnect() {
    if (this.supported) {
      listenEvent(screen.orientation, "change", this.#onOrientationChange.bind(this));
    } else {
      const query = window.matchMedia("(orientation: landscape)");
      query.onchange = this.#onOrientationChange.bind(this);
      onDispose(() => query.onchange = null);
    }
    onDispose(this.#onDisconnect.bind(this));
  }
  async #onDisconnect() {
    if (this.supported && this.#locked()) await this.unlock();
  }
  #onOrientationChange(event) {
    this.#type.set(this.#getScreenOrientation());
    this.dispatch("orientation-change", {
      detail: {
        orientation: peek(this.#type),
        lock: this.#currentLock
      },
      trigger: event
    });
  }
  /**
   * Locks the orientation of the screen to the desired orientation type using the
   * Screen Orientation API.
   *
   * @param lockType - The screen lock orientation type.
   * @throws Error - If screen orientation API is unavailable.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Screen/orientation}
   * @see {@link https://w3c.github.io/screen-orientation}
   */
  async lock(lockType) {
    if (peek(this.#locked) || this.#currentLock === lockType) return;
    this.#assertScreenOrientationAPI();
    await screen.orientation.lock(lockType);
    this.#locked.set(true);
    this.#currentLock = lockType;
  }
  /**
   * Unlocks the orientation of the screen to it's default state using the Screen Orientation
   * API. This method will throw an error if the API is unavailable.
   *
   * @throws Error - If screen orientation API is unavailable.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Screen/orientation}
   * @see {@link https://w3c.github.io/screen-orientation}
   */
  async unlock() {
    if (!peek(this.#locked)) return;
    this.#assertScreenOrientationAPI();
    this.#currentLock = void 0;
    await screen.orientation.unlock();
    this.#locked.set(false);
  }
  #assertScreenOrientationAPI() {
    if (this.supported) return;
    throw Error(
      "[vidstack] screen orientation API is not available" 
    );
  }
  #getScreenOrientation() {
    if (this.supported) return window.screen.orientation.type;
    return window.innerWidth >= window.innerHeight ? "landscape-primary" : "portrait-primary";
  }
}

class Queue {
  #queue = /* @__PURE__ */ new Map();
  /**
   * Queue the given `item` under the given `key` to be processed at a later time by calling
   * `serve(key)`.
   */
  enqueue(key, item) {
    this.#queue.set(key, item);
  }
  /**
   * Process item in queue for the given `key`.
   */
  serve(key) {
    const value = this.peek(key);
    this.#queue.delete(key);
    return value;
  }
  /**
   * Peek at item in queue for the given `key`.
   */
  peek(key) {
    return this.#queue.get(key);
  }
  /**
   * Removes queued item under the given `key`.
   */
  delete(key) {
    this.#queue.delete(key);
  }
  /**
   * Clear all items in the queue.
   */
  clear() {
    this.#queue.clear();
  }
}

class RequestQueue {
  #serving = false;
  #pending = deferredPromise();
  #queue = /* @__PURE__ */ new Map();
  /**
   * The number of callbacks that are currently in queue.
   */
  get size() {
    return this.#queue.size;
  }
  /**
   * Whether items in the queue are being served immediately, otherwise they're queued to
   * be processed later.
   */
  get isServing() {
    return this.#serving;
  }
  /**
   * Waits for the queue to be flushed (ie: start serving).
   */
  async waitForFlush() {
    if (this.#serving) return;
    await this.#pending.promise;
  }
  /**
   * Queue the given `callback` to be invoked at a later time by either calling the `serve()` or
   * `start()` methods. If the queue has started serving (i.e., `start()` was already called),
   * then the callback will be invoked immediately.
   *
   * @param key - Uniquely identifies this callback so duplicates are ignored.
   * @param callback - The function to call when this item in the queue is being served.
   */
  enqueue(key, callback) {
    if (this.#serving) {
      callback();
      return;
    }
    this.#queue.delete(key);
    this.#queue.set(key, callback);
  }
  /**
   * Invokes the callback with the given `key` in the queue (if it exists).
   */
  serve(key) {
    this.#queue.get(key)?.();
    this.#queue.delete(key);
  }
  /**
   * Flush all queued items and start serving future requests immediately until `stop()` is called.
   */
  start() {
    this.#flush();
    this.#serving = true;
    if (this.#queue.size > 0) this.#flush();
  }
  /**
   * Stop serving requests, they'll be queued until you begin processing again by calling `start()`.
   */
  stop() {
    this.#serving = false;
  }
  /**
   * Stop serving requests, empty the request queue, and release any promises waiting for the
   * queue to flush.
   */
  reset() {
    this.stop();
    this.#queue.clear();
    this.#release();
  }
  #flush() {
    for (const key of this.#queue.keys()) this.serve(key);
    this.#release();
  }
  #release() {
    this.#pending.resolve();
    this.#pending = deferredPromise();
  }
}

function coerceToError(error) {
  return error instanceof Error ? error : Error(typeof error === "string" ? error : JSON.stringify(error));
}
function assert(condition, message) {
  if (!condition) {
    throw Error(message || "Assertion failed.");
  }
}

/**
 * Custom positioning reference element.
 * @see https://floating-ui.com/docs/virtual-elements
 */

const min = Math.min;
const max = Math.max;
const round$1 = Math.round;
const floor = Math.floor;
const createCoords = v => ({
  x: v,
  y: v
});
const oppositeSideMap = {
  left: 'right',
  right: 'left',
  bottom: 'top',
  top: 'bottom'
};
const oppositeAlignmentMap = {
  start: 'end',
  end: 'start'
};
function clamp(start, value, end) {
  return max(start, min(value, end));
}
function evaluate(value, param) {
  return typeof value === 'function' ? value(param) : value;
}
function getSide(placement) {
  return placement.split('-')[0];
}
function getAlignment(placement) {
  return placement.split('-')[1];
}
function getOppositeAxis(axis) {
  return axis === 'x' ? 'y' : 'x';
}
function getAxisLength(axis) {
  return axis === 'y' ? 'height' : 'width';
}
function getSideAxis(placement) {
  return ['top', 'bottom'].includes(getSide(placement)) ? 'y' : 'x';
}
function getAlignmentAxis(placement) {
  return getOppositeAxis(getSideAxis(placement));
}
function getAlignmentSides(placement, rects, rtl) {
  if (rtl === void 0) {
    rtl = false;
  }
  const alignment = getAlignment(placement);
  const alignmentAxis = getAlignmentAxis(placement);
  const length = getAxisLength(alignmentAxis);
  let mainAlignmentSide = alignmentAxis === 'x' ? alignment === (rtl ? 'end' : 'start') ? 'right' : 'left' : alignment === 'start' ? 'bottom' : 'top';
  if (rects.reference[length] > rects.floating[length]) {
    mainAlignmentSide = getOppositePlacement(mainAlignmentSide);
  }
  return [mainAlignmentSide, getOppositePlacement(mainAlignmentSide)];
}
function getExpandedPlacements(placement) {
  const oppositePlacement = getOppositePlacement(placement);
  return [getOppositeAlignmentPlacement(placement), oppositePlacement, getOppositeAlignmentPlacement(oppositePlacement)];
}
function getOppositeAlignmentPlacement(placement) {
  return placement.replace(/start|end/g, alignment => oppositeAlignmentMap[alignment]);
}
function getSideList(side, isStart, rtl) {
  const lr = ['left', 'right'];
  const rl = ['right', 'left'];
  const tb = ['top', 'bottom'];
  const bt = ['bottom', 'top'];
  switch (side) {
    case 'top':
    case 'bottom':
      if (rtl) return isStart ? rl : lr;
      return isStart ? lr : rl;
    case 'left':
    case 'right':
      return isStart ? tb : bt;
    default:
      return [];
  }
}
function getOppositeAxisPlacements(placement, flipAlignment, direction, rtl) {
  const alignment = getAlignment(placement);
  let list = getSideList(getSide(placement), direction === 'start', rtl);
  if (alignment) {
    list = list.map(side => side + "-" + alignment);
    if (flipAlignment) {
      list = list.concat(list.map(getOppositeAlignmentPlacement));
    }
  }
  return list;
}
function getOppositePlacement(placement) {
  return placement.replace(/left|right|bottom|top/g, side => oppositeSideMap[side]);
}
function expandPaddingObject(padding) {
  return {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    ...padding
  };
}
function getPaddingObject(padding) {
  return typeof padding !== 'number' ? expandPaddingObject(padding) : {
    top: padding,
    right: padding,
    bottom: padding,
    left: padding
  };
}
function rectToClientRect(rect) {
  const {
    x,
    y,
    width,
    height
  } = rect;
  return {
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    x,
    y
  };
}

function computeCoordsFromPlacement(_ref, placement, rtl) {
  let {
    reference,
    floating
  } = _ref;
  const sideAxis = getSideAxis(placement);
  const alignmentAxis = getAlignmentAxis(placement);
  const alignLength = getAxisLength(alignmentAxis);
  const side = getSide(placement);
  const isVertical = sideAxis === 'y';
  const commonX = reference.x + reference.width / 2 - floating.width / 2;
  const commonY = reference.y + reference.height / 2 - floating.height / 2;
  const commonAlign = reference[alignLength] / 2 - floating[alignLength] / 2;
  let coords;
  switch (side) {
    case 'top':
      coords = {
        x: commonX,
        y: reference.y - floating.height
      };
      break;
    case 'bottom':
      coords = {
        x: commonX,
        y: reference.y + reference.height
      };
      break;
    case 'right':
      coords = {
        x: reference.x + reference.width,
        y: commonY
      };
      break;
    case 'left':
      coords = {
        x: reference.x - floating.width,
        y: commonY
      };
      break;
    default:
      coords = {
        x: reference.x,
        y: reference.y
      };
  }
  switch (getAlignment(placement)) {
    case 'start':
      coords[alignmentAxis] -= commonAlign * (rtl && isVertical ? -1 : 1);
      break;
    case 'end':
      coords[alignmentAxis] += commonAlign * (rtl && isVertical ? -1 : 1);
      break;
  }
  return coords;
}

/**
 * Computes the `x` and `y` coordinates that will place the floating element
 * next to a given reference element.
 *
 * This export does not have any `platform` interface logic. You will need to
 * write one for the platform you are using Floating UI with.
 */
const computePosition$1 = async (reference, floating, config) => {
  const {
    placement = 'bottom',
    strategy = 'absolute',
    middleware = [],
    platform
  } = config;
  const validMiddleware = middleware.filter(Boolean);
  const rtl = await (platform.isRTL == null ? void 0 : platform.isRTL(floating));
  let rects = await platform.getElementRects({
    reference,
    floating,
    strategy
  });
  let {
    x,
    y
  } = computeCoordsFromPlacement(rects, placement, rtl);
  let statefulPlacement = placement;
  let middlewareData = {};
  let resetCount = 0;
  for (let i = 0; i < validMiddleware.length; i++) {
    const {
      name,
      fn
    } = validMiddleware[i];
    const {
      x: nextX,
      y: nextY,
      data,
      reset
    } = await fn({
      x,
      y,
      initialPlacement: placement,
      placement: statefulPlacement,
      strategy,
      middlewareData,
      rects,
      platform,
      elements: {
        reference,
        floating
      }
    });
    x = nextX != null ? nextX : x;
    y = nextY != null ? nextY : y;
    middlewareData = {
      ...middlewareData,
      [name]: {
        ...middlewareData[name],
        ...data
      }
    };
    if (reset && resetCount <= 50) {
      resetCount++;
      if (typeof reset === 'object') {
        if (reset.placement) {
          statefulPlacement = reset.placement;
        }
        if (reset.rects) {
          rects = reset.rects === true ? await platform.getElementRects({
            reference,
            floating,
            strategy
          }) : reset.rects;
        }
        ({
          x,
          y
        } = computeCoordsFromPlacement(rects, statefulPlacement, rtl));
      }
      i = -1;
    }
  }
  return {
    x,
    y,
    placement: statefulPlacement,
    strategy,
    middlewareData
  };
};

/**
 * Resolves with an object of overflow side offsets that determine how much the
 * element is overflowing a given clipping boundary on each side.
 * - positive = overflowing the boundary by that number of pixels
 * - negative = how many pixels left before it will overflow
 * - 0 = lies flush with the boundary
 * @see https://floating-ui.com/docs/detectOverflow
 */
async function detectOverflow(state, options) {
  var _await$platform$isEle;
  if (options === void 0) {
    options = {};
  }
  const {
    x,
    y,
    platform,
    rects,
    elements,
    strategy
  } = state;
  const {
    boundary = 'clippingAncestors',
    rootBoundary = 'viewport',
    elementContext = 'floating',
    altBoundary = false,
    padding = 0
  } = evaluate(options, state);
  const paddingObject = getPaddingObject(padding);
  const altContext = elementContext === 'floating' ? 'reference' : 'floating';
  const element = elements[altBoundary ? altContext : elementContext];
  const clippingClientRect = rectToClientRect(await platform.getClippingRect({
    element: ((_await$platform$isEle = await (platform.isElement == null ? void 0 : platform.isElement(element))) != null ? _await$platform$isEle : true) ? element : element.contextElement || (await (platform.getDocumentElement == null ? void 0 : platform.getDocumentElement(elements.floating))),
    boundary,
    rootBoundary,
    strategy
  }));
  const rect = elementContext === 'floating' ? {
    x,
    y,
    width: rects.floating.width,
    height: rects.floating.height
  } : rects.reference;
  const offsetParent = await (platform.getOffsetParent == null ? void 0 : platform.getOffsetParent(elements.floating));
  const offsetScale = (await (platform.isElement == null ? void 0 : platform.isElement(offsetParent))) ? (await (platform.getScale == null ? void 0 : platform.getScale(offsetParent))) || {
    x: 1,
    y: 1
  } : {
    x: 1,
    y: 1
  };
  const elementClientRect = rectToClientRect(platform.convertOffsetParentRelativeRectToViewportRelativeRect ? await platform.convertOffsetParentRelativeRectToViewportRelativeRect({
    elements,
    rect,
    offsetParent,
    strategy
  }) : rect);
  return {
    top: (clippingClientRect.top - elementClientRect.top + paddingObject.top) / offsetScale.y,
    bottom: (elementClientRect.bottom - clippingClientRect.bottom + paddingObject.bottom) / offsetScale.y,
    left: (clippingClientRect.left - elementClientRect.left + paddingObject.left) / offsetScale.x,
    right: (elementClientRect.right - clippingClientRect.right + paddingObject.right) / offsetScale.x
  };
}

/**
 * Optimizes the visibility of the floating element by flipping the `placement`
 * in order to keep it in view when the preferred placement(s) will overflow the
 * clipping boundary. Alternative to `autoPlacement`.
 * @see https://floating-ui.com/docs/flip
 */
const flip$1 = function (options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: 'flip',
    options,
    async fn(state) {
      var _middlewareData$arrow, _middlewareData$flip;
      const {
        placement,
        middlewareData,
        rects,
        initialPlacement,
        platform,
        elements
      } = state;
      const {
        mainAxis: checkMainAxis = true,
        crossAxis: checkCrossAxis = true,
        fallbackPlacements: specifiedFallbackPlacements,
        fallbackStrategy = 'bestFit',
        fallbackAxisSideDirection = 'none',
        flipAlignment = true,
        ...detectOverflowOptions
      } = evaluate(options, state);

      // If a reset by the arrow was caused due to an alignment offset being
      // added, we should skip any logic now since `flip()` has already done its
      // work.
      // https://github.com/floating-ui/floating-ui/issues/2549#issuecomment-1719601643
      if ((_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
        return {};
      }
      const side = getSide(placement);
      const initialSideAxis = getSideAxis(initialPlacement);
      const isBasePlacement = getSide(initialPlacement) === initialPlacement;
      const rtl = await (platform.isRTL == null ? void 0 : platform.isRTL(elements.floating));
      const fallbackPlacements = specifiedFallbackPlacements || (isBasePlacement || !flipAlignment ? [getOppositePlacement(initialPlacement)] : getExpandedPlacements(initialPlacement));
      const hasFallbackAxisSideDirection = fallbackAxisSideDirection !== 'none';
      if (!specifiedFallbackPlacements && hasFallbackAxisSideDirection) {
        fallbackPlacements.push(...getOppositeAxisPlacements(initialPlacement, flipAlignment, fallbackAxisSideDirection, rtl));
      }
      const placements = [initialPlacement, ...fallbackPlacements];
      const overflow = await detectOverflow(state, detectOverflowOptions);
      const overflows = [];
      let overflowsData = ((_middlewareData$flip = middlewareData.flip) == null ? void 0 : _middlewareData$flip.overflows) || [];
      if (checkMainAxis) {
        overflows.push(overflow[side]);
      }
      if (checkCrossAxis) {
        const sides = getAlignmentSides(placement, rects, rtl);
        overflows.push(overflow[sides[0]], overflow[sides[1]]);
      }
      overflowsData = [...overflowsData, {
        placement,
        overflows
      }];

      // One or more sides is overflowing.
      if (!overflows.every(side => side <= 0)) {
        var _middlewareData$flip2, _overflowsData$filter;
        const nextIndex = (((_middlewareData$flip2 = middlewareData.flip) == null ? void 0 : _middlewareData$flip2.index) || 0) + 1;
        const nextPlacement = placements[nextIndex];
        if (nextPlacement) {
          // Try next placement and re-run the lifecycle.
          return {
            data: {
              index: nextIndex,
              overflows: overflowsData
            },
            reset: {
              placement: nextPlacement
            }
          };
        }

        // First, find the candidates that fit on the mainAxis side of overflow,
        // then find the placement that fits the best on the main crossAxis side.
        let resetPlacement = (_overflowsData$filter = overflowsData.filter(d => d.overflows[0] <= 0).sort((a, b) => a.overflows[1] - b.overflows[1])[0]) == null ? void 0 : _overflowsData$filter.placement;

        // Otherwise fallback.
        if (!resetPlacement) {
          switch (fallbackStrategy) {
            case 'bestFit':
              {
                var _overflowsData$filter2;
                const placement = (_overflowsData$filter2 = overflowsData.filter(d => {
                  if (hasFallbackAxisSideDirection) {
                    const currentSideAxis = getSideAxis(d.placement);
                    return currentSideAxis === initialSideAxis ||
                    // Create a bias to the `y` side axis due to horizontal
                    // reading directions favoring greater width.
                    currentSideAxis === 'y';
                  }
                  return true;
                }).map(d => [d.placement, d.overflows.filter(overflow => overflow > 0).reduce((acc, overflow) => acc + overflow, 0)]).sort((a, b) => a[1] - b[1])[0]) == null ? void 0 : _overflowsData$filter2[0];
                if (placement) {
                  resetPlacement = placement;
                }
                break;
              }
            case 'initialPlacement':
              resetPlacement = initialPlacement;
              break;
          }
        }
        if (placement !== resetPlacement) {
          return {
            reset: {
              placement: resetPlacement
            }
          };
        }
      }
      return {};
    }
  };
};

/**
 * Optimizes the visibility of the floating element by shifting it in order to
 * keep it in view when it will overflow the clipping boundary.
 * @see https://floating-ui.com/docs/shift
 */
const shift$1 = function (options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: 'shift',
    options,
    async fn(state) {
      const {
        x,
        y,
        placement
      } = state;
      const {
        mainAxis: checkMainAxis = true,
        crossAxis: checkCrossAxis = false,
        limiter = {
          fn: _ref => {
            let {
              x,
              y
            } = _ref;
            return {
              x,
              y
            };
          }
        },
        ...detectOverflowOptions
      } = evaluate(options, state);
      const coords = {
        x,
        y
      };
      const overflow = await detectOverflow(state, detectOverflowOptions);
      const crossAxis = getSideAxis(getSide(placement));
      const mainAxis = getOppositeAxis(crossAxis);
      let mainAxisCoord = coords[mainAxis];
      let crossAxisCoord = coords[crossAxis];
      if (checkMainAxis) {
        const minSide = mainAxis === 'y' ? 'top' : 'left';
        const maxSide = mainAxis === 'y' ? 'bottom' : 'right';
        const min = mainAxisCoord + overflow[minSide];
        const max = mainAxisCoord - overflow[maxSide];
        mainAxisCoord = clamp(min, mainAxisCoord, max);
      }
      if (checkCrossAxis) {
        const minSide = crossAxis === 'y' ? 'top' : 'left';
        const maxSide = crossAxis === 'y' ? 'bottom' : 'right';
        const min = crossAxisCoord + overflow[minSide];
        const max = crossAxisCoord - overflow[maxSide];
        crossAxisCoord = clamp(min, crossAxisCoord, max);
      }
      const limitedCoords = limiter.fn({
        ...state,
        [mainAxis]: mainAxisCoord,
        [crossAxis]: crossAxisCoord
      });
      return {
        ...limitedCoords,
        data: {
          x: limitedCoords.x - x,
          y: limitedCoords.y - y,
          enabled: {
            [mainAxis]: checkMainAxis,
            [crossAxis]: checkCrossAxis
          }
        }
      };
    }
  };
};

function hasWindow() {
  return typeof window !== 'undefined';
}
function getNodeName(node) {
  if (isNode(node)) {
    return (node.nodeName || '').toLowerCase();
  }
  // Mocked nodes in testing environments may not be instances of Node. By
  // returning `#document` an infinite loop won't occur.
  // https://github.com/floating-ui/floating-ui/issues/2317
  return '#document';
}
function getWindow(node) {
  var _node$ownerDocument;
  return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
}
function getDocumentElement(node) {
  var _ref;
  return (_ref = (isNode(node) ? node.ownerDocument : node.document) || window.document) == null ? void 0 : _ref.documentElement;
}
function isNode(value) {
  if (!hasWindow()) {
    return false;
  }
  return value instanceof Node || value instanceof getWindow(value).Node;
}
function isElement(value) {
  if (!hasWindow()) {
    return false;
  }
  return value instanceof Element || value instanceof getWindow(value).Element;
}
function isHTMLElement$1(value) {
  if (!hasWindow()) {
    return false;
  }
  return value instanceof HTMLElement || value instanceof getWindow(value).HTMLElement;
}
function isShadowRoot(value) {
  if (!hasWindow() || typeof ShadowRoot === 'undefined') {
    return false;
  }
  return value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
}
function isOverflowElement(element) {
  const {
    overflow,
    overflowX,
    overflowY,
    display
  } = getComputedStyle$1(element);
  return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && !['inline', 'contents'].includes(display);
}
function isTableElement(element) {
  return ['table', 'td', 'th'].includes(getNodeName(element));
}
function isTopLayer(element) {
  return [':popover-open', ':modal'].some(selector => {
    try {
      return element.matches(selector);
    } catch (e) {
      return false;
    }
  });
}
function isContainingBlock(elementOrCss) {
  const webkit = isWebKit();
  const css = isElement(elementOrCss) ? getComputedStyle$1(elementOrCss) : elementOrCss;

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Containing_block#identifying_the_containing_block
  return css.transform !== 'none' || css.perspective !== 'none' || (css.containerType ? css.containerType !== 'normal' : false) || !webkit && (css.backdropFilter ? css.backdropFilter !== 'none' : false) || !webkit && (css.filter ? css.filter !== 'none' : false) || ['transform', 'perspective', 'filter'].some(value => (css.willChange || '').includes(value)) || ['paint', 'layout', 'strict', 'content'].some(value => (css.contain || '').includes(value));
}
function getContainingBlock(element) {
  let currentNode = getParentNode(element);
  while (isHTMLElement$1(currentNode) && !isLastTraversableNode(currentNode)) {
    if (isContainingBlock(currentNode)) {
      return currentNode;
    } else if (isTopLayer(currentNode)) {
      return null;
    }
    currentNode = getParentNode(currentNode);
  }
  return null;
}
function isWebKit() {
  if (typeof CSS === 'undefined' || !CSS.supports) return false;
  return CSS.supports('-webkit-backdrop-filter', 'none');
}
function isLastTraversableNode(node) {
  return ['html', 'body', '#document'].includes(getNodeName(node));
}
function getComputedStyle$1(element) {
  return getWindow(element).getComputedStyle(element);
}
function getNodeScroll(element) {
  if (isElement(element)) {
    return {
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop
    };
  }
  return {
    scrollLeft: element.scrollX,
    scrollTop: element.scrollY
  };
}
function getParentNode(node) {
  if (getNodeName(node) === 'html') {
    return node;
  }
  const result =
  // Step into the shadow DOM of the parent of a slotted node.
  node.assignedSlot ||
  // DOM Element detected.
  node.parentNode ||
  // ShadowRoot detected.
  isShadowRoot(node) && node.host ||
  // Fallback.
  getDocumentElement(node);
  return isShadowRoot(result) ? result.host : result;
}
function getNearestOverflowAncestor(node) {
  const parentNode = getParentNode(node);
  if (isLastTraversableNode(parentNode)) {
    return node.ownerDocument ? node.ownerDocument.body : node.body;
  }
  if (isHTMLElement$1(parentNode) && isOverflowElement(parentNode)) {
    return parentNode;
  }
  return getNearestOverflowAncestor(parentNode);
}
function getOverflowAncestors(node, list, traverseIframes) {
  var _node$ownerDocument2;
  if (list === void 0) {
    list = [];
  }
  if (traverseIframes === void 0) {
    traverseIframes = true;
  }
  const scrollableAncestor = getNearestOverflowAncestor(node);
  const isBody = scrollableAncestor === ((_node$ownerDocument2 = node.ownerDocument) == null ? void 0 : _node$ownerDocument2.body);
  const win = getWindow(scrollableAncestor);
  if (isBody) {
    const frameElement = getFrameElement(win);
    return list.concat(win, win.visualViewport || [], isOverflowElement(scrollableAncestor) ? scrollableAncestor : [], frameElement && traverseIframes ? getOverflowAncestors(frameElement) : []);
  }
  return list.concat(scrollableAncestor, getOverflowAncestors(scrollableAncestor, [], traverseIframes));
}
function getFrameElement(win) {
  return win.parent && Object.getPrototypeOf(win.parent) ? win.frameElement : null;
}

function getCssDimensions(element) {
  const css = getComputedStyle$1(element);
  // In testing environments, the `width` and `height` properties are empty
  // strings for SVG elements, returning NaN. Fallback to `0` in this case.
  let width = parseFloat(css.width) || 0;
  let height = parseFloat(css.height) || 0;
  const hasOffset = isHTMLElement$1(element);
  const offsetWidth = hasOffset ? element.offsetWidth : width;
  const offsetHeight = hasOffset ? element.offsetHeight : height;
  const shouldFallback = round$1(width) !== offsetWidth || round$1(height) !== offsetHeight;
  if (shouldFallback) {
    width = offsetWidth;
    height = offsetHeight;
  }
  return {
    width,
    height,
    $: shouldFallback
  };
}

function unwrapElement(element) {
  return !isElement(element) ? element.contextElement : element;
}

function getScale(element) {
  const domElement = unwrapElement(element);
  if (!isHTMLElement$1(domElement)) {
    return createCoords(1);
  }
  const rect = domElement.getBoundingClientRect();
  const {
    width,
    height,
    $
  } = getCssDimensions(domElement);
  let x = ($ ? round$1(rect.width) : rect.width) / width;
  let y = ($ ? round$1(rect.height) : rect.height) / height;

  // 0, NaN, or Infinity should always fallback to 1.

  if (!x || !Number.isFinite(x)) {
    x = 1;
  }
  if (!y || !Number.isFinite(y)) {
    y = 1;
  }
  return {
    x,
    y
  };
}

const noOffsets = /*#__PURE__*/createCoords(0);
function getVisualOffsets(element) {
  const win = getWindow(element);
  if (!isWebKit() || !win.visualViewport) {
    return noOffsets;
  }
  return {
    x: win.visualViewport.offsetLeft,
    y: win.visualViewport.offsetTop
  };
}
function shouldAddVisualOffsets(element, isFixed, floatingOffsetParent) {
  if (isFixed === void 0) {
    isFixed = false;
  }
  if (!floatingOffsetParent || isFixed && floatingOffsetParent !== getWindow(element)) {
    return false;
  }
  return isFixed;
}

function getBoundingClientRect(element, includeScale, isFixedStrategy, offsetParent) {
  if (includeScale === void 0) {
    includeScale = false;
  }
  if (isFixedStrategy === void 0) {
    isFixedStrategy = false;
  }
  const clientRect = element.getBoundingClientRect();
  const domElement = unwrapElement(element);
  let scale = createCoords(1);
  if (includeScale) {
    if (offsetParent) {
      if (isElement(offsetParent)) {
        scale = getScale(offsetParent);
      }
    } else {
      scale = getScale(element);
    }
  }
  const visualOffsets = shouldAddVisualOffsets(domElement, isFixedStrategy, offsetParent) ? getVisualOffsets(domElement) : createCoords(0);
  let x = (clientRect.left + visualOffsets.x) / scale.x;
  let y = (clientRect.top + visualOffsets.y) / scale.y;
  let width = clientRect.width / scale.x;
  let height = clientRect.height / scale.y;
  if (domElement) {
    const win = getWindow(domElement);
    const offsetWin = offsetParent && isElement(offsetParent) ? getWindow(offsetParent) : offsetParent;
    let currentWin = win;
    let currentIFrame = getFrameElement(currentWin);
    while (currentIFrame && offsetParent && offsetWin !== currentWin) {
      const iframeScale = getScale(currentIFrame);
      const iframeRect = currentIFrame.getBoundingClientRect();
      const css = getComputedStyle$1(currentIFrame);
      const left = iframeRect.left + (currentIFrame.clientLeft + parseFloat(css.paddingLeft)) * iframeScale.x;
      const top = iframeRect.top + (currentIFrame.clientTop + parseFloat(css.paddingTop)) * iframeScale.y;
      x *= iframeScale.x;
      y *= iframeScale.y;
      width *= iframeScale.x;
      height *= iframeScale.y;
      x += left;
      y += top;
      currentWin = getWindow(currentIFrame);
      currentIFrame = getFrameElement(currentWin);
    }
  }
  return rectToClientRect({
    width,
    height,
    x,
    y
  });
}

function convertOffsetParentRelativeRectToViewportRelativeRect(_ref) {
  let {
    elements,
    rect,
    offsetParent,
    strategy
  } = _ref;
  const isFixed = strategy === 'fixed';
  const documentElement = getDocumentElement(offsetParent);
  const topLayer = elements ? isTopLayer(elements.floating) : false;
  if (offsetParent === documentElement || topLayer && isFixed) {
    return rect;
  }
  let scroll = {
    scrollLeft: 0,
    scrollTop: 0
  };
  let scale = createCoords(1);
  const offsets = createCoords(0);
  const isOffsetParentAnElement = isHTMLElement$1(offsetParent);
  if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) {
    if (getNodeName(offsetParent) !== 'body' || isOverflowElement(documentElement)) {
      scroll = getNodeScroll(offsetParent);
    }
    if (isHTMLElement$1(offsetParent)) {
      const offsetRect = getBoundingClientRect(offsetParent);
      scale = getScale(offsetParent);
      offsets.x = offsetRect.x + offsetParent.clientLeft;
      offsets.y = offsetRect.y + offsetParent.clientTop;
    }
  }
  return {
    width: rect.width * scale.x,
    height: rect.height * scale.y,
    x: rect.x * scale.x - scroll.scrollLeft * scale.x + offsets.x,
    y: rect.y * scale.y - scroll.scrollTop * scale.y + offsets.y
  };
}

function getClientRects(element) {
  return Array.from(element.getClientRects());
}

// If <html> has a CSS width greater than the viewport, then this will be
// incorrect for RTL.
function getWindowScrollBarX(element, rect) {
  const leftScroll = getNodeScroll(element).scrollLeft;
  if (!rect) {
    return getBoundingClientRect(getDocumentElement(element)).left + leftScroll;
  }
  return rect.left + leftScroll;
}

// Gets the entire size of the scrollable document area, even extending outside
// of the `<html>` and `<body>` rect bounds if horizontally scrollable.
function getDocumentRect(element) {
  const html = getDocumentElement(element);
  const scroll = getNodeScroll(element);
  const body = element.ownerDocument.body;
  const width = max(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth);
  const height = max(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight);
  let x = -scroll.scrollLeft + getWindowScrollBarX(element);
  const y = -scroll.scrollTop;
  if (getComputedStyle$1(body).direction === 'rtl') {
    x += max(html.clientWidth, body.clientWidth) - width;
  }
  return {
    width,
    height,
    x,
    y
  };
}

function getViewportRect(element, strategy) {
  const win = getWindow(element);
  const html = getDocumentElement(element);
  const visualViewport = win.visualViewport;
  let width = html.clientWidth;
  let height = html.clientHeight;
  let x = 0;
  let y = 0;
  if (visualViewport) {
    width = visualViewport.width;
    height = visualViewport.height;
    const visualViewportBased = isWebKit();
    if (!visualViewportBased || visualViewportBased && strategy === 'fixed') {
      x = visualViewport.offsetLeft;
      y = visualViewport.offsetTop;
    }
  }
  return {
    width,
    height,
    x,
    y
  };
}

// Returns the inner client rect, subtracting scrollbars if present.
function getInnerBoundingClientRect(element, strategy) {
  const clientRect = getBoundingClientRect(element, true, strategy === 'fixed');
  const top = clientRect.top + element.clientTop;
  const left = clientRect.left + element.clientLeft;
  const scale = isHTMLElement$1(element) ? getScale(element) : createCoords(1);
  const width = element.clientWidth * scale.x;
  const height = element.clientHeight * scale.y;
  const x = left * scale.x;
  const y = top * scale.y;
  return {
    width,
    height,
    x,
    y
  };
}
function getClientRectFromClippingAncestor(element, clippingAncestor, strategy) {
  let rect;
  if (clippingAncestor === 'viewport') {
    rect = getViewportRect(element, strategy);
  } else if (clippingAncestor === 'document') {
    rect = getDocumentRect(getDocumentElement(element));
  } else if (isElement(clippingAncestor)) {
    rect = getInnerBoundingClientRect(clippingAncestor, strategy);
  } else {
    const visualOffsets = getVisualOffsets(element);
    rect = {
      ...clippingAncestor,
      x: clippingAncestor.x - visualOffsets.x,
      y: clippingAncestor.y - visualOffsets.y
    };
  }
  return rectToClientRect(rect);
}
function hasFixedPositionAncestor(element, stopNode) {
  const parentNode = getParentNode(element);
  if (parentNode === stopNode || !isElement(parentNode) || isLastTraversableNode(parentNode)) {
    return false;
  }
  return getComputedStyle$1(parentNode).position === 'fixed' || hasFixedPositionAncestor(parentNode, stopNode);
}

// A "clipping ancestor" is an `overflow` element with the characteristic of
// clipping (or hiding) child elements. This returns all clipping ancestors
// of the given element up the tree.
function getClippingElementAncestors(element, cache) {
  const cachedResult = cache.get(element);
  if (cachedResult) {
    return cachedResult;
  }
  let result = getOverflowAncestors(element, [], false).filter(el => isElement(el) && getNodeName(el) !== 'body');
  let currentContainingBlockComputedStyle = null;
  const elementIsFixed = getComputedStyle$1(element).position === 'fixed';
  let currentNode = elementIsFixed ? getParentNode(element) : element;

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Containing_block#identifying_the_containing_block
  while (isElement(currentNode) && !isLastTraversableNode(currentNode)) {
    const computedStyle = getComputedStyle$1(currentNode);
    const currentNodeIsContaining = isContainingBlock(currentNode);
    if (!currentNodeIsContaining && computedStyle.position === 'fixed') {
      currentContainingBlockComputedStyle = null;
    }
    const shouldDropCurrentNode = elementIsFixed ? !currentNodeIsContaining && !currentContainingBlockComputedStyle : !currentNodeIsContaining && computedStyle.position === 'static' && !!currentContainingBlockComputedStyle && ['absolute', 'fixed'].includes(currentContainingBlockComputedStyle.position) || isOverflowElement(currentNode) && !currentNodeIsContaining && hasFixedPositionAncestor(element, currentNode);
    if (shouldDropCurrentNode) {
      // Drop non-containing blocks.
      result = result.filter(ancestor => ancestor !== currentNode);
    } else {
      // Record last containing block for next iteration.
      currentContainingBlockComputedStyle = computedStyle;
    }
    currentNode = getParentNode(currentNode);
  }
  cache.set(element, result);
  return result;
}

// Gets the maximum area that the element is visible in due to any number of
// clipping ancestors.
function getClippingRect(_ref) {
  let {
    element,
    boundary,
    rootBoundary,
    strategy
  } = _ref;
  const elementClippingAncestors = boundary === 'clippingAncestors' ? isTopLayer(element) ? [] : getClippingElementAncestors(element, this._c) : [].concat(boundary);
  const clippingAncestors = [...elementClippingAncestors, rootBoundary];
  const firstClippingAncestor = clippingAncestors[0];
  const clippingRect = clippingAncestors.reduce((accRect, clippingAncestor) => {
    const rect = getClientRectFromClippingAncestor(element, clippingAncestor, strategy);
    accRect.top = max(rect.top, accRect.top);
    accRect.right = min(rect.right, accRect.right);
    accRect.bottom = min(rect.bottom, accRect.bottom);
    accRect.left = max(rect.left, accRect.left);
    return accRect;
  }, getClientRectFromClippingAncestor(element, firstClippingAncestor, strategy));
  return {
    width: clippingRect.right - clippingRect.left,
    height: clippingRect.bottom - clippingRect.top,
    x: clippingRect.left,
    y: clippingRect.top
  };
}

function getDimensions(element) {
  const {
    width,
    height
  } = getCssDimensions(element);
  return {
    width,
    height
  };
}

function getRectRelativeToOffsetParent(element, offsetParent, strategy) {
  const isOffsetParentAnElement = isHTMLElement$1(offsetParent);
  const documentElement = getDocumentElement(offsetParent);
  const isFixed = strategy === 'fixed';
  const rect = getBoundingClientRect(element, true, isFixed, offsetParent);
  let scroll = {
    scrollLeft: 0,
    scrollTop: 0
  };
  const offsets = createCoords(0);
  if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) {
    if (getNodeName(offsetParent) !== 'body' || isOverflowElement(documentElement)) {
      scroll = getNodeScroll(offsetParent);
    }
    if (isOffsetParentAnElement) {
      const offsetRect = getBoundingClientRect(offsetParent, true, isFixed, offsetParent);
      offsets.x = offsetRect.x + offsetParent.clientLeft;
      offsets.y = offsetRect.y + offsetParent.clientTop;
    } else if (documentElement) {
      // If the <body> scrollbar appears on the left (e.g. RTL systems). Use
      // Firefox with layout.scrollbar.side = 3 in about:config to test this.
      offsets.x = getWindowScrollBarX(documentElement);
    }
  }
  let htmlX = 0;
  let htmlY = 0;
  if (documentElement && !isOffsetParentAnElement && !isFixed) {
    const htmlRect = documentElement.getBoundingClientRect();
    htmlY = htmlRect.top + scroll.scrollTop;
    htmlX = htmlRect.left + scroll.scrollLeft -
    // RTL <body> scrollbar.
    getWindowScrollBarX(documentElement, htmlRect);
  }
  const x = rect.left + scroll.scrollLeft - offsets.x - htmlX;
  const y = rect.top + scroll.scrollTop - offsets.y - htmlY;
  return {
    x,
    y,
    width: rect.width,
    height: rect.height
  };
}

function isStaticPositioned(element) {
  return getComputedStyle$1(element).position === 'static';
}

function getTrueOffsetParent(element, polyfill) {
  if (!isHTMLElement$1(element) || getComputedStyle$1(element).position === 'fixed') {
    return null;
  }
  if (polyfill) {
    return polyfill(element);
  }
  let rawOffsetParent = element.offsetParent;

  // Firefox returns the <html> element as the offsetParent if it's non-static,
  // while Chrome and Safari return the <body> element. The <body> element must
  // be used to perform the correct calculations even if the <html> element is
  // non-static.
  if (getDocumentElement(element) === rawOffsetParent) {
    rawOffsetParent = rawOffsetParent.ownerDocument.body;
  }
  return rawOffsetParent;
}

// Gets the closest ancestor positioned element. Handles some edge cases,
// such as table ancestors and cross browser bugs.
function getOffsetParent(element, polyfill) {
  const win = getWindow(element);
  if (isTopLayer(element)) {
    return win;
  }
  if (!isHTMLElement$1(element)) {
    let svgOffsetParent = getParentNode(element);
    while (svgOffsetParent && !isLastTraversableNode(svgOffsetParent)) {
      if (isElement(svgOffsetParent) && !isStaticPositioned(svgOffsetParent)) {
        return svgOffsetParent;
      }
      svgOffsetParent = getParentNode(svgOffsetParent);
    }
    return win;
  }
  let offsetParent = getTrueOffsetParent(element, polyfill);
  while (offsetParent && isTableElement(offsetParent) && isStaticPositioned(offsetParent)) {
    offsetParent = getTrueOffsetParent(offsetParent, polyfill);
  }
  if (offsetParent && isLastTraversableNode(offsetParent) && isStaticPositioned(offsetParent) && !isContainingBlock(offsetParent)) {
    return win;
  }
  return offsetParent || getContainingBlock(element) || win;
}

const getElementRects = async function (data) {
  const getOffsetParentFn = this.getOffsetParent || getOffsetParent;
  const getDimensionsFn = this.getDimensions;
  const floatingDimensions = await getDimensionsFn(data.floating);
  return {
    reference: getRectRelativeToOffsetParent(data.reference, await getOffsetParentFn(data.floating), data.strategy),
    floating: {
      x: 0,
      y: 0,
      width: floatingDimensions.width,
      height: floatingDimensions.height
    }
  };
};

function isRTL(element) {
  return getComputedStyle$1(element).direction === 'rtl';
}

const platform = {
  convertOffsetParentRelativeRectToViewportRelativeRect,
  getDocumentElement,
  getClippingRect,
  getOffsetParent,
  getElementRects,
  getClientRects,
  getDimensions,
  getScale,
  isElement,
  isRTL
};

// https://samthor.au/2021/observing-dom/
function observeMove(element, onMove) {
  let io = null;
  let timeoutId;
  const root = getDocumentElement(element);
  function cleanup() {
    var _io;
    clearTimeout(timeoutId);
    (_io = io) == null || _io.disconnect();
    io = null;
  }
  function refresh(skip, threshold) {
    if (skip === void 0) {
      skip = false;
    }
    if (threshold === void 0) {
      threshold = 1;
    }
    cleanup();
    const {
      left,
      top,
      width,
      height
    } = element.getBoundingClientRect();
    if (!skip) {
      onMove();
    }
    if (!width || !height) {
      return;
    }
    const insetTop = floor(top);
    const insetRight = floor(root.clientWidth - (left + width));
    const insetBottom = floor(root.clientHeight - (top + height));
    const insetLeft = floor(left);
    const rootMargin = -insetTop + "px " + -insetRight + "px " + -insetBottom + "px " + -insetLeft + "px";
    const options = {
      rootMargin,
      threshold: max(0, min(1, threshold)) || 1
    };
    let isFirstUpdate = true;
    function handleObserve(entries) {
      const ratio = entries[0].intersectionRatio;
      if (ratio !== threshold) {
        if (!isFirstUpdate) {
          return refresh();
        }
        if (!ratio) {
          // If the reference is clipped, the ratio is 0. Throttle the refresh
          // to prevent an infinite loop of updates.
          timeoutId = setTimeout(() => {
            refresh(false, 1e-7);
          }, 1000);
        } else {
          refresh(false, ratio);
        }
      }
      isFirstUpdate = false;
    }

    // Older browsers don't support a `document` as the root and will throw an
    // error.
    try {
      io = new IntersectionObserver(handleObserve, {
        ...options,
        // Handle <iframe>s
        root: root.ownerDocument
      });
    } catch (e) {
      io = new IntersectionObserver(handleObserve, options);
    }
    io.observe(element);
  }
  refresh(true);
  return cleanup;
}

/**
 * Automatically updates the position of the floating element when necessary.
 * Should only be called when the floating element is mounted on the DOM or
 * visible on the screen.
 * @returns cleanup function that should be invoked when the floating element is
 * removed from the DOM or hidden from the screen.
 * @see https://floating-ui.com/docs/autoUpdate
 */
function autoUpdate(reference, floating, update, options) {
  if (options === void 0) {
    options = {};
  }
  const {
    ancestorScroll = true,
    ancestorResize = true,
    elementResize = typeof ResizeObserver === 'function',
    layoutShift = typeof IntersectionObserver === 'function',
    animationFrame = false
  } = options;
  const referenceEl = unwrapElement(reference);
  const ancestors = ancestorScroll || ancestorResize ? [...(referenceEl ? getOverflowAncestors(referenceEl) : []), ...getOverflowAncestors(floating)] : [];
  ancestors.forEach(ancestor => {
    ancestorScroll && ancestor.addEventListener('scroll', update, {
      passive: true
    });
    ancestorResize && ancestor.addEventListener('resize', update);
  });
  const cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update) : null;
  let reobserveFrame = -1;
  let resizeObserver = null;
  if (elementResize) {
    resizeObserver = new ResizeObserver(_ref => {
      let [firstEntry] = _ref;
      if (firstEntry && firstEntry.target === referenceEl && resizeObserver) {
        // Prevent update loops when using the `size` middleware.
        // https://github.com/floating-ui/floating-ui/issues/1740
        resizeObserver.unobserve(floating);
        cancelAnimationFrame(reobserveFrame);
        reobserveFrame = requestAnimationFrame(() => {
          var _resizeObserver;
          (_resizeObserver = resizeObserver) == null || _resizeObserver.observe(floating);
        });
      }
      update();
    });
    if (referenceEl && !animationFrame) {
      resizeObserver.observe(referenceEl);
    }
    resizeObserver.observe(floating);
  }
  let frameId;
  let prevRefRect = animationFrame ? getBoundingClientRect(reference) : null;
  if (animationFrame) {
    frameLoop();
  }
  function frameLoop() {
    const nextRefRect = getBoundingClientRect(reference);
    if (prevRefRect && (nextRefRect.x !== prevRefRect.x || nextRefRect.y !== prevRefRect.y || nextRefRect.width !== prevRefRect.width || nextRefRect.height !== prevRefRect.height)) {
      update();
    }
    prevRefRect = nextRefRect;
    frameId = requestAnimationFrame(frameLoop);
  }
  update();
  return () => {
    var _resizeObserver2;
    ancestors.forEach(ancestor => {
      ancestorScroll && ancestor.removeEventListener('scroll', update);
      ancestorResize && ancestor.removeEventListener('resize', update);
    });
    cleanupIo == null || cleanupIo();
    (_resizeObserver2 = resizeObserver) == null || _resizeObserver2.disconnect();
    resizeObserver = null;
    if (animationFrame) {
      cancelAnimationFrame(frameId);
    }
  };
}

/**
 * Optimizes the visibility of the floating element by shifting it in order to
 * keep it in view when it will overflow the clipping boundary.
 * @see https://floating-ui.com/docs/shift
 */
const shift = shift$1;

/**
 * Optimizes the visibility of the floating element by flipping the `placement`
 * in order to keep it in view when the preferred placement(s) will overflow the
 * clipping boundary. Alternative to `autoPlacement`.
 * @see https://floating-ui.com/docs/flip
 */
const flip = flip$1;

/**
 * Computes the `x` and `y` coordinates that will place the floating element
 * next to a given reference element.
 */
const computePosition = (reference, floating, options) => {
  // This caches the expensive `getClippingElementAncestors` function so that
  // multiple lifecycle resets re-use the same result. It only lives for a
  // single call. If other functions become expensive, we can add them as well.
  const cache = new Map();
  const mergedOptions = {
    platform,
    ...options
  };
  const platformWithCache = {
    ...mergedOptions.platform,
    _c: cache
  };
  return computePosition$1(reference, floating, {
    ...mergedOptions,
    platform: platformWithCache
  });
};

function round(num, decimalPlaces = 2) {
  return Number(num.toFixed(decimalPlaces));
}
function getNumberOfDecimalPlaces(num) {
  return String(num).split(".")[1]?.length ?? 0;
}
function clampNumber(min, value, max) {
  return Math.max(min, Math.min(max, value));
}

function isEventInside(el, event) {
  const target = event.composedPath()[0];
  return isDOMNode(target) && el.contains(target);
}
const rafJobs = /* @__PURE__ */ new Set();
{
  let processJobs = function() {
    for (const job of rafJobs) {
      try {
        job();
      } catch (e) {
        console.error(`[vidstack] failed job:

${e}`);
      }
    }
    window.requestAnimationFrame(processJobs);
  };
  processJobs();
}
function scheduleRafJob(job) {
  rafJobs.add(job);
  return () => rafJobs.delete(job);
}
function setAttributeIfEmpty(target, name, value) {
  if (!target.hasAttribute(name)) target.setAttribute(name, value);
}
function setARIALabel(target, $label) {
  if (target.hasAttribute("aria-label") || target.hasAttribute("data-no-label")) return;
  if (!isFunction($label)) {
    setAttribute(target, "aria-label", $label);
    return;
  }
  function updateAriaDescription() {
    setAttribute(target, "aria-label", $label());
  }
  effect(updateAriaDescription);
}
function isElementVisible(el) {
  const style = getComputedStyle(el);
  return style.display !== "none" && parseInt(style.opacity) > 0;
}
function checkVisibility(el) {
  return !!el && ("checkVisibility" in el ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : isElementVisible(el));
}
function observeVisibility(el, callback) {
  return scheduleRafJob(() => callback(checkVisibility(el)));
}
function isElementParent(owner, node, test) {
  while (node) {
    if (node === owner) {
      return true;
    } else if (test?.(node)) {
      break;
    } else {
      node = node.parentElement;
    }
  }
  return false;
}
function onPress(target, handler) {
  return new EventsController(target).add("pointerup", (event) => {
    if (event.button === 0 && !event.defaultPrevented) handler(event);
  }).add("keydown", (event) => {
    if (isKeyboardClick(event)) handler(event);
  });
}
function isTouchPinchEvent(event) {
  return isTouchEvent(event) && (event.touches.length > 1 || event.changedTouches.length > 1);
}
function requestScopedAnimationFrame(callback) {
  let scope = getScope(), id = window.requestAnimationFrame(() => {
    scoped(callback, scope);
    id = -1;
  });
  return () => void window.cancelAnimationFrame(id);
}
function cloneTemplate(template, length, onCreate) {
  let current, prev = template, parent = template.parentElement, content = template.content.firstElementChild, elements = [];
  if (!content && template.firstElementChild) {
    template.innerHTML = template.firstElementChild.outerHTML;
    template.firstElementChild.remove();
    content = template.content.firstElementChild;
  }
  if (content?.nodeType !== 1) {
    throw Error("[vidstack] template must contain root element");
  }
  for (let i = 0; i < length; i++) {
    current = document.importNode(content, true);
    onCreate?.(current, i);
    parent.insertBefore(current, prev.nextSibling);
    elements.push(current);
    prev = current;
  }
  onDispose(() => {
    for (let i = 0; i < elements.length; i++) elements[i].remove();
  });
  return elements;
}
function createTemplate(content) {
  const template = document.createElement("template");
  template.innerHTML = content;
  return template.content;
}
function cloneTemplateContent(content) {
  const fragment = content.cloneNode(true);
  return fragment.firstElementChild;
}
function autoPlacement(el, trigger, placement, {
  offsetVarName,
  xOffset,
  yOffset,
  ...options
}) {
  if (!el) return;
  const floatingPlacement = placement.replace(" ", "-").replace("-center", "");
  setStyle(el, "visibility", !trigger ? "hidden" : null);
  if (!trigger) return;
  let isTop = placement.includes("top");
  const negateX = (x) => placement.includes("left") ? `calc(-1 * ${x})` : x, negateY = (y) => isTop ? `calc(-1 * ${y})` : y;
  return autoUpdate(trigger, el, () => {
    computePosition(trigger, el, {
      placement: floatingPlacement,
      middleware: [
        ...options.middleware ?? [],
        flip({ fallbackAxisSideDirection: "start", crossAxis: false }),
        shift()
      ],
      ...options
    }).then(({ x, y, middlewareData }) => {
      const hasFlipped = !!middlewareData.flip?.index;
      isTop = placement.includes(hasFlipped ? "bottom" : "top");
      el.setAttribute(
        "data-placement",
        hasFlipped ? placement.startsWith("top") ? placement.replace("top", "bottom") : placement.replace("bottom", "top") : placement
      );
      Object.assign(el.style, {
        top: `calc(${y + "px"} + ${negateY(
          yOffset ? yOffset + "px" : `var(--${offsetVarName}-y-offset, 0px)`
        )})`,
        left: `calc(${x + "px"} + ${negateX(
          xOffset ? xOffset + "px" : `var(--${offsetVarName}-x-offset, 0px)`
        )})`
      });
    });
  });
}
function hasAnimation(el) {
  const styles = getComputedStyle(el);
  return styles.animationName !== "none";
}
function createSlot(name) {
  const slot = document.createElement("slot");
  slot.name = name;
  return slot;
}
function useTransitionActive($el) {
  const $active = signal(false);
  effect(() => {
    const el = $el();
    if (!el) return;
    new EventsController(el).add("transitionstart", () => $active.set(true)).add("transitionend", () => $active.set(false));
  });
  return $active;
}
function useResizeObserver($el, onResize) {
  function onElementChange() {
    const el = $el();
    if (!el) return;
    onResize();
    const observer = new ResizeObserver(animationFrameThrottle(onResize));
    observer.observe(el);
    return () => observer.disconnect();
  }
  effect(onElementChange);
}
function useActive($el) {
  const $isMouseEnter = useMouseEnter($el), $isFocusedIn = useFocusIn($el);
  let prevMouseEnter = false;
  return computed(() => {
    const isMouseEnter = $isMouseEnter();
    if (prevMouseEnter && !isMouseEnter) return false;
    prevMouseEnter = isMouseEnter;
    return isMouseEnter || $isFocusedIn();
  });
}
function useMouseEnter($el) {
  const $isMouseEnter = signal(false);
  effect(() => {
    const el = $el();
    if (!el) {
      $isMouseEnter.set(false);
      return;
    }
    new EventsController(el).add("mouseenter", () => $isMouseEnter.set(true)).add("mouseleave", () => $isMouseEnter.set(false));
  });
  return $isMouseEnter;
}
function useFocusIn($el) {
  const $isFocusIn = signal(false);
  effect(() => {
    const el = $el();
    if (!el) {
      $isFocusIn.set(false);
      return;
    }
    new EventsController(el).add("focusin", () => $isFocusIn.set(true)).add("focusout", () => $isFocusIn.set(false));
  });
  return $isFocusIn;
}
function isHTMLElement(el) {
  return el instanceof HTMLElement;
}
function useColorSchemePreference() {
  const colorScheme = signal("dark");
  const media = window.matchMedia("(prefers-color-scheme: light)");
  function onChange() {
    colorScheme.set(media.matches ? "light" : "dark");
  }
  onChange();
  listenEvent(media, "change", onChange);
  return colorScheme;
}
function watchColorScheme(el, colorScheme) {
  effect(() => {
    const scheme = colorScheme();
    if (scheme === "system") {
      const preference = useColorSchemePreference();
      effect(() => updateColorScheme(preference()));
      return;
    }
    updateColorScheme(scheme);
  });
  function updateColorScheme(scheme) {
    toggleClass(el, "light", scheme === "light");
    toggleClass(el, "dark", scheme === "dark");
  }
}

class MediaControls extends MediaPlayerController {
  #idleTimer = -2;
  #pausedTracking = false;
  #hideOnMouseLeave = signal(false);
  #isMouseOutside = signal(false);
  #focusedItem = null;
  #canIdle = signal(true);
  /**
   * The default amount of delay in milliseconds while media playback is progressing without user
   * activity to indicate an idle state (i.e., hide controls).
   *
   * @defaultValue 2000
   */
  defaultDelay = 2e3;
  /**
   * Whether controls can hide after a delay in user interaction. If this is false, controls will
   * not hide and be user controlled.
   */
  get canIdle() {
    return this.#canIdle();
  }
  set canIdle(canIdle) {
    this.#canIdle.set(canIdle);
  }
  /**
   * Whether controls visibility should be toggled when the mouse enters and leaves the player
   * container.
   *
   * @defaultValue false
   */
  get hideOnMouseLeave() {
    const { hideControlsOnMouseLeave } = this.$props;
    return this.#hideOnMouseLeave() || hideControlsOnMouseLeave();
  }
  set hideOnMouseLeave(hide) {
    this.#hideOnMouseLeave.set(hide);
  }
  /**
   * Whether media controls are currently visible.
   */
  get showing() {
    return this.$state.controlsVisible();
  }
  /**
   * Show controls.
   */
  show(delay = 0, trigger) {
    this.#clearIdleTimer();
    if (!this.#pausedTracking) {
      this.#changeVisibility(true, delay, trigger);
    }
  }
  /**
   * Hide controls.
   */
  hide(delay = this.defaultDelay, trigger) {
    this.#clearIdleTimer();
    if (!this.#pausedTracking) {
      this.#changeVisibility(false, delay, trigger);
    }
  }
  /**
   * Whether all idle tracking on controls should be paused until resumed again.
   */
  pause(trigger) {
    this.#pausedTracking = true;
    this.#clearIdleTimer();
    this.#changeVisibility(true, 0, trigger);
  }
  resume(trigger) {
    this.#pausedTracking = false;
    if (this.$state.paused()) return;
    this.#changeVisibility(false, this.defaultDelay, trigger);
  }
  onConnect() {
    effect(this.#init.bind(this));
  }
  #init() {
    const { viewType } = this.$state;
    if (!this.el || !this.#canIdle()) return;
    if (viewType() === "audio") {
      this.show();
      return;
    }
    effect(this.#watchMouse.bind(this));
    effect(this.#watchPaused.bind(this));
    const onPlay = this.#onPlay.bind(this), onPause = this.#onPause.bind(this), onEnd = this.#onEnd.bind(this);
    new EventsController(this.el).add("can-play", (event) => this.show(0, event)).add("play", onPlay).add("pause", onPause).add("end", onEnd).add("auto-play-fail", onPause);
  }
  #watchMouse() {
    if (!this.el) return;
    const { started, pointer, paused } = this.$state;
    if (!started() || pointer() !== "fine") return;
    const events = new EventsController(this.el), shouldHideOnMouseLeave = this.hideOnMouseLeave;
    if (!shouldHideOnMouseLeave || !this.#isMouseOutside()) {
      effect(() => {
        if (!paused()) events.add("pointermove", this.#onStopIdle.bind(this));
      });
    }
    if (shouldHideOnMouseLeave) {
      events.add("mouseenter", this.#onMouseEnter.bind(this)).add("mouseleave", this.#onMouseLeave.bind(this));
    }
  }
  #watchPaused() {
    const { paused, started, autoPlayError } = this.$state;
    if (paused() || autoPlayError() && !started()) return;
    const onStopIdle = this.#onStopIdle.bind(this);
    effect(() => {
      if (!this.el) return;
      const pointer = this.$state.pointer(), isTouch = pointer === "coarse", events = new EventsController(this.el), eventTypes = [isTouch ? "touchend" : "pointerup", "keydown"];
      for (const eventType of eventTypes) {
        events.add(eventType, onStopIdle, { passive: false });
      }
    });
  }
  #onPlay(event) {
    if (event.triggers.hasType("ended")) return;
    this.show(0, event);
    this.hide(void 0, event);
  }
  #onPause(event) {
    this.show(0, event);
  }
  #onEnd(event) {
    const { loop } = this.$state;
    if (loop()) this.hide(0, event);
  }
  #onMouseEnter(event) {
    this.#isMouseOutside.set(false);
    this.show(0, event);
    this.hide(void 0, event);
  }
  #onMouseLeave(event) {
    this.#isMouseOutside.set(true);
    this.hide(0, event);
  }
  #clearIdleTimer() {
    window.clearTimeout(this.#idleTimer);
    this.#idleTimer = -1;
  }
  #onStopIdle(event) {
    if (
      // @ts-expect-error
      event.MEDIA_GESTURE || this.#pausedTracking || isTouchPinchEvent(event)
    ) {
      return;
    }
    if (isKeyboardEvent(event)) {
      if (event.key === "Escape") {
        this.el?.focus();
        this.#focusedItem = null;
      } else if (this.#focusedItem) {
        event.preventDefault();
        requestAnimationFrame(() => {
          this.#focusedItem?.focus();
          this.#focusedItem = null;
        });
      }
    }
    this.show(0, event);
    this.hide(this.defaultDelay, event);
  }
  #changeVisibility(visible, delay, trigger) {
    if (delay === 0) {
      this.#onChange(visible, trigger);
      return;
    }
    this.#idleTimer = window.setTimeout(() => {
      if (!this.scope) return;
      this.#onChange(visible && !this.#pausedTracking, trigger);
    }, delay);
  }
  #onChange(visible, trigger) {
    if (this.$state.controlsVisible() === visible) return;
    this.$state.controlsVisible.set(visible);
    if (!visible && document.activeElement && this.el?.contains(document.activeElement)) {
      this.#focusedItem = document.activeElement;
      requestAnimationFrame(() => {
        this.el?.focus({ preventScroll: true });
      });
    }
    this.dispatch("controls-change", {
      detail: visible,
      trigger
    });
  }
}

class MediaRequestManager extends MediaPlayerController {
  #stateMgr;
  #request;
  #media;
  controls;
  #fullscreen;
  #orientation;
  #$provider;
  #providerQueue = new RequestQueue();
  constructor(stateMgr, request, media) {
    super();
    this.#stateMgr = stateMgr;
    this.#request = request;
    this.#media = media;
    this.#$provider = media.$provider;
    this.controls = new MediaControls();
    this.#fullscreen = new FullscreenController();
    this.#orientation = new ScreenOrientationController();
  }
  onAttach() {
    this.listen("fullscreen-change", this.#onFullscreenChange.bind(this));
  }
  onConnect(el) {
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(this)), events = new EventsController(el), handleRequest = this.#handleRequest.bind(this);
    for (const name of names) {
      if (name.startsWith("media-")) {
        events.add(name, handleRequest);
      }
    }
    this.#attachLoadPlayListener();
    effect(this.#watchProvider.bind(this));
    effect(this.#watchControlsDelayChange.bind(this));
    effect(this.#watchAudioGainSupport.bind(this));
    effect(this.#watchAirPlaySupport.bind(this));
    effect(this.#watchGoogleCastSupport.bind(this));
    effect(this.#watchFullscreenSupport.bind(this));
    effect(this.#watchPiPSupport.bind(this));
  }
  onDestroy() {
    try {
      const destroyEvent = this.createEvent("destroy"), { pictureInPicture, fullscreen } = this.$state;
      if (fullscreen()) this.exitFullscreen("prefer-media", destroyEvent);
      if (pictureInPicture()) this.exitPictureInPicture(destroyEvent);
    } catch (e) {
    }
    this.#providerQueue.reset();
  }
  #attachLoadPlayListener() {
    const { load } = this.$props, { canLoad } = this.$state;
    if (load() !== "play" || canLoad()) return;
    const off = this.listen("media-play-request", (event) => {
      this.#handleLoadPlayStrategy(event);
      off();
    });
  }
  #watchProvider() {
    const provider = this.#$provider(), canPlay = this.$state.canPlay();
    if (provider && canPlay) {
      this.#providerQueue.start();
    }
    return () => {
      this.#providerQueue.stop();
    };
  }
  #handleRequest(event) {
    event.stopPropagation();
    if (event.defaultPrevented) return;
    {
      this.#media.logger?.infoGroup(`\u{1F4EC} received \`${event.type}\``).labelledLog("Request", event).dispatch();
    }
    if (!this[event.type]) return;
    if (peek(this.#$provider)) {
      this[event.type](event);
    } else {
      this.#providerQueue.enqueue(event.type, () => {
        if (peek(this.#$provider)) this[event.type](event);
      });
    }
  }
  async play(trigger) {
    const { canPlay, paused, autoPlaying } = this.$state;
    if (this.#handleLoadPlayStrategy(trigger)) return;
    if (!peek(paused)) return;
    if (trigger) this.#request.queue.enqueue("media-play-request", trigger);
    const isAutoPlaying = peek(autoPlaying);
    try {
      const provider = peek(this.#$provider);
      throwIfNotReadyForPlayback(provider, peek(canPlay));
      return await provider.play();
    } catch (error) {
      this.#logError("play request failed", error, trigger);
      const errorEvent = this.createEvent("play-fail", {
        detail: coerceToError(error),
        trigger
      });
      errorEvent.autoPlay = isAutoPlaying;
      this.#stateMgr.handle(errorEvent);
      throw error;
    }
  }
  #handleLoadPlayStrategy(trigger) {
    const { load } = this.$props, { canLoad } = this.$state;
    if (load() === "play" && !canLoad()) {
      const event = this.createEvent("media-start-loading", { trigger });
      this.dispatchEvent(event);
      this.#providerQueue.enqueue("media-play-request", async () => {
        try {
          await this.play(event);
        } catch (error) {
        }
      });
      return true;
    }
    return false;
  }
  async pause(trigger) {
    const { canPlay, paused } = this.$state;
    if (peek(paused)) return;
    if (trigger) {
      this.#request.queue.enqueue("media-pause-request", trigger);
    }
    try {
      const provider = peek(this.#$provider);
      throwIfNotReadyForPlayback(provider, peek(canPlay));
      return await provider.pause();
    } catch (error) {
      this.#request.queue.delete("media-pause-request");
      {
        this.#logError("pause request failed", error, trigger);
      }
      throw error;
    }
  }
  setAudioGain(gain, trigger) {
    const { audioGain, canSetAudioGain } = this.$state;
    if (audioGain() === gain) return;
    const provider = this.#$provider();
    if (!provider?.audioGain || !canSetAudioGain()) {
      throw Error("[vidstack] audio gain api not available");
    }
    if (trigger) {
      this.#request.queue.enqueue("media-audio-gain-change-request", trigger);
    }
    provider.audioGain.setGain(gain);
  }
  seekToLiveEdge(trigger) {
    const { canPlay, live, liveEdge, canSeek, liveSyncPosition, seekableEnd, userBehindLiveEdge } = this.$state;
    userBehindLiveEdge.set(false);
    if (peek(() => !live() || liveEdge() || !canSeek())) return;
    const provider = peek(this.#$provider);
    throwIfNotReadyForPlayback(provider, peek(canPlay));
    if (trigger) this.#request.queue.enqueue("media-seek-request", trigger);
    const end = seekableEnd() - 2;
    provider.setCurrentTime(Math.min(end, liveSyncPosition() ?? end));
  }
  #wasPIPActive = false;
  async enterFullscreen(target = "prefer-media", trigger) {
    const adapter = this.#getFullscreenAdapter(target);
    throwIfFullscreenNotSupported(target, adapter);
    if (adapter.active) return;
    if (peek(this.$state.pictureInPicture)) {
      this.#wasPIPActive = true;
      await this.exitPictureInPicture(trigger);
    }
    if (trigger) {
      this.#request.queue.enqueue("media-enter-fullscreen-request", trigger);
    }
    return adapter.enter();
  }
  async exitFullscreen(target = "prefer-media", trigger) {
    const adapter = this.#getFullscreenAdapter(target);
    throwIfFullscreenNotSupported(target, adapter);
    if (!adapter.active) return;
    if (trigger) {
      this.#request.queue.enqueue("media-exit-fullscreen-request", trigger);
    }
    try {
      const result = await adapter.exit();
      if (this.#wasPIPActive && peek(this.$state.canPictureInPicture)) {
        await this.enterPictureInPicture();
      }
      return result;
    } finally {
      this.#wasPIPActive = false;
    }
  }
  #getFullscreenAdapter(target) {
    const provider = peek(this.#$provider);
    return target === "prefer-media" && this.#fullscreen.supported || target === "media" ? this.#fullscreen : provider?.fullscreen;
  }
  async enterPictureInPicture(trigger) {
    this.#throwIfPIPNotSupported();
    if (this.$state.pictureInPicture()) return;
    if (trigger) {
      this.#request.queue.enqueue("media-enter-pip-request", trigger);
    }
    return await this.#$provider().pictureInPicture.enter();
  }
  async exitPictureInPicture(trigger) {
    this.#throwIfPIPNotSupported();
    if (!this.$state.pictureInPicture()) return;
    if (trigger) {
      this.#request.queue.enqueue("media-exit-pip-request", trigger);
    }
    return await this.#$provider().pictureInPicture.exit();
  }
  #throwIfPIPNotSupported() {
    if (this.$state.canPictureInPicture()) return;
    throw Error(
      `[vidstack] picture-in-picture is not currently available` 
    );
  }
  #watchControlsDelayChange() {
    this.controls.defaultDelay = this.$props.controlsDelay();
  }
  #watchAudioGainSupport() {
    const { canSetAudioGain } = this.$state, supported = !!this.#$provider()?.audioGain?.supported;
    canSetAudioGain.set(supported);
  }
  #watchAirPlaySupport() {
    const { canAirPlay } = this.$state, supported = !!this.#$provider()?.airPlay?.supported;
    canAirPlay.set(supported);
  }
  #watchGoogleCastSupport() {
    const { canGoogleCast, source } = this.$state, supported = IS_CHROME && !IS_IOS && canGoogleCastSrc(source());
    canGoogleCast.set(supported);
  }
  #watchFullscreenSupport() {
    const { canFullscreen } = this.$state, supported = this.#fullscreen.supported || !!this.#$provider()?.fullscreen?.supported;
    canFullscreen.set(supported);
  }
  #watchPiPSupport() {
    const { canPictureInPicture } = this.$state, supported = !!this.#$provider()?.pictureInPicture?.supported;
    canPictureInPicture.set(supported);
  }
  async ["media-airplay-request"](event) {
    try {
      await this.requestAirPlay(event);
    } catch (error) {
    }
  }
  async requestAirPlay(trigger) {
    try {
      const adapter = this.#$provider()?.airPlay;
      if (!adapter?.supported) {
        throw Error(true ? "AirPlay adapter not available on provider." : "No AirPlay adapter.");
      }
      if (trigger) {
        this.#request.queue.enqueue("media-airplay-request", trigger);
      }
      return await adapter.prompt();
    } catch (error) {
      this.#request.queue.delete("media-airplay-request");
      {
        this.#logError("airplay request failed", error, trigger);
      }
      throw error;
    }
  }
  async ["media-google-cast-request"](event) {
    try {
      await this.requestGoogleCast(event);
    } catch (error) {
    }
  }
  #googleCastLoader;
  async requestGoogleCast(trigger) {
    try {
      const { canGoogleCast } = this.$state;
      if (!peek(canGoogleCast)) {
        const error = Error(
          true ? "Google Cast not available on this platform." : "Cast not available."
        );
        error.code = "CAST_NOT_AVAILABLE";
        throw error;
      }
      preconnect("https://www.gstatic.com");
      if (!this.#googleCastLoader) {
        const $module = await Promise.resolve().then(function () { return loader; });
        this.#googleCastLoader = new $module.GoogleCastLoader();
      }
      await this.#googleCastLoader.prompt(this.#media);
      if (trigger) {
        this.#request.queue.enqueue("media-google-cast-request", trigger);
      }
      const isConnecting = peek(this.$state.remotePlaybackState) !== "disconnected";
      if (isConnecting) {
        this.$state.savedState.set({
          paused: peek(this.$state.paused),
          currentTime: peek(this.$state.currentTime)
        });
      }
      this.$state.remotePlaybackLoader.set(isConnecting ? this.#googleCastLoader : null);
    } catch (error) {
      this.#request.queue.delete("media-google-cast-request");
      {
        this.#logError("google cast request failed", error, trigger);
      }
      throw error;
    }
  }
  ["media-clip-start-change-request"](event) {
    const { clipStartTime } = this.$state;
    clipStartTime.set(event.detail);
  }
  ["media-clip-end-change-request"](event) {
    const { clipEndTime } = this.$state;
    clipEndTime.set(event.detail);
    this.dispatch("duration-change", {
      detail: event.detail,
      trigger: event
    });
  }
  ["media-duration-change-request"](event) {
    const { providedDuration, clipEndTime } = this.$state;
    providedDuration.set(event.detail);
    if (clipEndTime() <= 0) {
      this.dispatch("duration-change", {
        detail: event.detail,
        trigger: event
      });
    }
  }
  ["media-audio-track-change-request"](event) {
    const { logger, audioTracks } = this.#media;
    if (audioTracks.readonly) {
      {
        logger?.warnGroup(`[vidstack] attempted to change audio track but it is currently read-only`).labelledLog("Request Event", event).dispatch();
      }
      return;
    }
    const index = event.detail, track = audioTracks[index];
    if (track) {
      const key = event.type;
      this.#request.queue.enqueue(key, event);
      track.selected = true;
    } else {
      logger?.warnGroup("[vidstack] failed audio track change request (invalid index)").labelledLog("Audio Tracks", audioTracks.toArray()).labelledLog("Index", index).labelledLog("Request Event", event).dispatch();
    }
  }
  async ["media-enter-fullscreen-request"](event) {
    try {
      await this.enterFullscreen(event.detail, event);
    } catch (error) {
      this.#onFullscreenError(error, event);
    }
  }
  async ["media-exit-fullscreen-request"](event) {
    try {
      await this.exitFullscreen(event.detail, event);
    } catch (error) {
      this.#onFullscreenError(error, event);
    }
  }
  async #onFullscreenChange(event) {
    const lockType = peek(this.$props.fullscreenOrientation), isFullscreen = event.detail;
    if (isUndefined(lockType) || lockType === "none" || !this.#orientation.supported) return;
    if (isFullscreen) {
      if (this.#orientation.locked) return;
      this.dispatch("media-orientation-lock-request", {
        detail: lockType,
        trigger: event
      });
    } else if (this.#orientation.locked) {
      this.dispatch("media-orientation-unlock-request", {
        trigger: event
      });
    }
  }
  #onFullscreenError(error, request) {
    {
      this.#logError("fullscreen request failed", error, request);
    }
    this.#stateMgr.handle(
      this.createEvent("fullscreen-error", {
        detail: coerceToError(error)
      })
    );
  }
  async ["media-orientation-lock-request"](event) {
    const key = event.type;
    try {
      this.#request.queue.enqueue(key, event);
      await this.#orientation.lock(event.detail);
    } catch (error) {
      this.#request.queue.delete(key);
      {
        this.#logError("failed to lock screen orientation", error, event);
      }
    }
  }
  async ["media-orientation-unlock-request"](event) {
    const key = event.type;
    try {
      this.#request.queue.enqueue(key, event);
      await this.#orientation.unlock();
    } catch (error) {
      this.#request.queue.delete(key);
      {
        this.#logError("failed to unlock screen orientation", error, event);
      }
    }
  }
  async ["media-enter-pip-request"](event) {
    try {
      await this.enterPictureInPicture(event);
    } catch (error) {
      this.#onPictureInPictureError(error, event);
    }
  }
  async ["media-exit-pip-request"](event) {
    try {
      await this.exitPictureInPicture(event);
    } catch (error) {
      this.#onPictureInPictureError(error, event);
    }
  }
  #onPictureInPictureError(error, request) {
    {
      this.#logError("pip request failed", error, request);
    }
    this.#stateMgr.handle(
      this.createEvent("picture-in-picture-error", {
        detail: coerceToError(error)
      })
    );
  }
  ["media-live-edge-request"](event) {
    const { live, liveEdge, canSeek } = this.$state;
    if (!live() || liveEdge() || !canSeek()) return;
    this.#request.queue.enqueue("media-seek-request", event);
    try {
      this.seekToLiveEdge();
    } catch (error) {
      this.#request.queue.delete("media-seek-request");
      {
        this.#logError("seek to live edge fail", error, event);
      }
    }
  }
  async ["media-loop-request"](event) {
    try {
      this.#request.looping = true;
      this.#request.replaying = true;
      await this.play(event);
    } catch (error) {
      this.#request.looping = false;
    }
  }
  ["media-user-loop-change-request"](event) {
    this.$state.userPrefersLoop.set(event.detail);
  }
  async ["media-pause-request"](event) {
    if (this.$state.paused()) return;
    try {
      await this.pause(event);
    } catch (error) {
    }
  }
  async ["media-play-request"](event) {
    if (!this.$state.paused()) return;
    try {
      await this.play(event);
    } catch (e) {
    }
  }
  ["media-rate-change-request"](event) {
    const { playbackRate, canSetPlaybackRate } = this.$state;
    if (playbackRate() === event.detail || !canSetPlaybackRate()) return;
    const provider = this.#$provider();
    if (!provider?.setPlaybackRate) return;
    this.#request.queue.enqueue("media-rate-change-request", event);
    provider.setPlaybackRate(event.detail);
  }
  ["media-audio-gain-change-request"](event) {
    try {
      this.setAudioGain(event.detail, event);
    } catch (e) {
    }
  }
  ["media-quality-change-request"](event) {
    const { qualities, storage, logger } = this.#media;
    if (qualities.readonly) {
      {
        logger?.warnGroup(`[vidstack] attempted to change video quality but it is currently read-only`).labelledLog("Request Event", event).dispatch();
      }
      return;
    }
    this.#request.queue.enqueue("media-quality-change-request", event);
    const index = event.detail;
    if (index < 0) {
      qualities.autoSelect(event);
      if (event.isOriginTrusted) storage?.setVideoQuality?.(null);
    } else {
      const quality = qualities[index];
      if (quality) {
        quality.selected = true;
        if (event.isOriginTrusted) {
          storage?.setVideoQuality?.({
            id: quality.id,
            width: quality.width,
            height: quality.height,
            bitrate: quality.bitrate
          });
        }
      } else {
        logger?.warnGroup("[vidstack] failed quality change request (invalid index)").labelledLog("Qualities", qualities.toArray()).labelledLog("Index", index).labelledLog("Request Event", event).dispatch();
      }
    }
  }
  ["media-pause-controls-request"](event) {
    const key = event.type;
    this.#request.queue.enqueue(key, event);
    this.controls.pause(event);
  }
  ["media-resume-controls-request"](event) {
    const key = event.type;
    this.#request.queue.enqueue(key, event);
    this.controls.resume(event);
  }
  ["media-seek-request"](event) {
    const { canSeek, ended, live, seekableEnd, userBehindLiveEdge } = this.$state, seekTime = event.detail;
    if (ended()) this.#request.replaying = true;
    const key = event.type;
    this.#request.seeking = false;
    this.#request.queue.delete(key);
    const boundedTime = boundTime(seekTime, this.$state);
    if (!Number.isFinite(boundedTime) || !canSeek()) return;
    this.#request.queue.enqueue(key, event);
    this.#$provider().setCurrentTime(boundedTime);
    if (live() && event.isOriginTrusted && Math.abs(seekableEnd() - boundedTime) >= 2) {
      userBehindLiveEdge.set(true);
    }
  }
  ["media-seeking-request"](event) {
    const key = event.type;
    this.#request.queue.enqueue(key, event);
    this.$state.seeking.set(true);
    this.#request.seeking = true;
  }
  ["media-start-loading"](event) {
    if (this.$state.canLoad()) return;
    const key = event.type;
    this.#request.queue.enqueue(key, event);
    this.#stateMgr.handle(this.createEvent("can-load"));
  }
  ["media-poster-start-loading"](event) {
    if (this.$state.canLoadPoster()) return;
    const key = event.type;
    this.#request.queue.enqueue(key, event);
    this.#stateMgr.handle(this.createEvent("can-load-poster"));
  }
  ["media-text-track-change-request"](event) {
    const { index, mode } = event.detail, track = this.#media.textTracks[index];
    if (track) {
      const key = event.type;
      this.#request.queue.enqueue(key, event);
      track.setMode(mode, event);
    } else {
      this.#media.logger?.warnGroup("[vidstack] failed text track change request (invalid index)").labelledLog("Text Tracks", this.#media.textTracks.toArray()).labelledLog("Index", index).labelledLog("Request Event", event).dispatch();
    }
  }
  ["media-mute-request"](event) {
    if (this.$state.muted()) return;
    const key = event.type;
    this.#request.queue.enqueue(key, event);
    this.#$provider().setMuted(true);
  }
  ["media-unmute-request"](event) {
    const { muted, volume } = this.$state;
    if (!muted()) return;
    const key = event.type;
    this.#request.queue.enqueue(key, event);
    this.#media.$provider().setMuted(false);
    if (volume() === 0) {
      this.#request.queue.enqueue(key, event);
      this.#$provider().setVolume(0.25);
    }
  }
  ["media-volume-change-request"](event) {
    const { muted, volume } = this.$state;
    const newVolume = event.detail;
    if (volume() === newVolume) return;
    const key = event.type;
    this.#request.queue.enqueue(key, event);
    this.#$provider().setVolume(newVolume);
    if (newVolume > 0 && muted()) {
      this.#request.queue.enqueue(key, event);
      this.#$provider().setMuted(false);
    }
  }
  #logError(title, error, request) {
    this.#media.logger?.errorGroup(`[vidstack] ${title}`).labelledLog("Error", error).labelledLog("Media Context", { ...this.#media }).labelledLog("Trigger Event", request).dispatch();
  }
}
function throwIfNotReadyForPlayback(provider, canPlay) {
  if (provider && canPlay) return;
  throw Error(
    `[vidstack] media is not ready - wait for \`can-play\` event.` 
  );
}
function throwIfFullscreenNotSupported(target, fullscreen) {
  if (fullscreen?.supported) return;
  throw Error(
    `[vidstack] fullscreen is not currently available on target \`${target}\`` 
  );
}
class MediaRequestContext {
  seeking = false;
  looping = false;
  replaying = false;
  queue = new Queue();
}

var functionDebounce = debounce;

function debounce(fn, wait, callFirst) {
  var timeout = null;
  var debouncedFn = null;

  var clear = function() {
    if (timeout) {
      clearTimeout(timeout);

      debouncedFn = null;
      timeout = null;
    }
  };

  var flush = function() {
    var call = debouncedFn;
    clear();

    if (call) {
      call();
    }
  };

  var debounceWrapper = function() {
    if (!wait) {
      return fn.apply(this, arguments);
    }

    var context = this;
    var args = arguments;
    var callNow = callFirst && !timeout;
    clear();

    debouncedFn = function() {
      fn.apply(context, args);
    };

    timeout = setTimeout(function() {
      timeout = null;

      if (!callNow) {
        var call = debouncedFn;
        debouncedFn = null;

        return call();
      }
    }, wait);

    if (callNow) {
      return debouncedFn();
    }
  };

  debounceWrapper.cancel = clear;
  debounceWrapper.flush = flush;

  return debounceWrapper;
}

var functionThrottle = throttle;

function throttle(fn, interval, options) {
  var timeoutId = null;
  var throttledFn = null;
  var leading = (options && options.leading);
  var trailing = (options && options.trailing);

  if (leading == null) {
    leading = true; // default
  }

  if (trailing == null) {
    trailing = !leading; //default
  }

  if (leading == true) {
    trailing = false; // forced because there should be invocation per call
  }

  var cancel = function() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  var flush = function() {
    var call = throttledFn;
    cancel();

    if (call) {
      call();
    }
  };

  var throttleWrapper = function() {
    var callNow = leading && !timeoutId;
    var context = this;
    var args = arguments;

    throttledFn = function() {
      return fn.apply(context, args);
    };

    if (!timeoutId) {
      timeoutId = setTimeout(function() {
        timeoutId = null;

        if (trailing) {
          return throttledFn();
        }
      }, interval);
    }

    if (callNow) {
      callNow = false;
      return throttledFn();
    }
  };

  throttleWrapper.cancel = cancel;
  throttleWrapper.flush = flush;

  return throttleWrapper;
}

function isVideoQualitySrc(src) {
  return !isString(src) && "width" in src && "height" in src && isNumber(src.width) && isNumber(src.height);
}

const TRACKED_EVENT = /* @__PURE__ */ new Set([
  "auto-play",
  "auto-play-fail",
  "can-load",
  "sources-change",
  "source-change",
  "load-start",
  "abort",
  "error",
  "loaded-metadata",
  "loaded-data",
  "can-play",
  "play",
  "play-fail",
  "pause",
  "playing",
  "seeking",
  "seeked",
  "waiting"
]);

class MediaStateManager extends MediaPlayerController {
  #request;
  #media;
  #trackedEvents = /* @__PURE__ */ new Map();
  #clipEnded = false;
  #playedIntervals = [];
  #playedInterval = [-1, -1];
  #firingWaiting = false;
  #waitingTrigger;
  constructor(request, media) {
    super();
    this.#request = request;
    this.#media = media;
  }
  onAttach(el) {
    el.setAttribute("aria-busy", "true");
    new EventsController(this).add("fullscreen-change", this["fullscreen-change"].bind(this)).add("fullscreen-error", this["fullscreen-error"].bind(this)).add("orientation-change", this["orientation-change"].bind(this));
  }
  onConnect(el) {
    effect(this.#watchCanSetVolume.bind(this));
    this.#addTextTrackListeners();
    this.#addQualityListeners();
    this.#addAudioTrackListeners();
    this.#resumePlaybackOnConnect();
    onDispose(this.#pausePlaybackOnDisconnect.bind(this));
  }
  onDestroy() {
    const { audioTracks, qualities, textTracks } = this.#media;
    audioTracks[ListSymbol.reset]();
    qualities[ListSymbol.reset]();
    textTracks[ListSymbol.reset]();
    this.#stopWatchingQualityResize();
  }
  handle(event) {
    if (!this.scope) return;
    const type = event.type;
    untrack(() => this[event.type]?.(event));
    {
      if (TRACKED_EVENT.has(type)) this.#trackedEvents.set(type, event);
      this.dispatch(event);
    }
  }
  #isPlayingOnDisconnect = false;
  #resumePlaybackOnConnect() {
    if (!this.#isPlayingOnDisconnect) return;
    requestAnimationFrame(() => {
      if (!this.scope) return;
      this.#media.remote.play(new DOMEvent("dom-connect"));
    });
    this.#isPlayingOnDisconnect = false;
  }
  #pausePlaybackOnDisconnect() {
    if (this.#isPlayingOnDisconnect) return;
    this.#isPlayingOnDisconnect = !this.$state.paused();
    this.#media.$provider()?.pause();
  }
  #resetTracking() {
    this.#stopWaiting();
    this.#clipEnded = false;
    this.#request.replaying = false;
    this.#request.looping = false;
    this.#firingWaiting = false;
    this.#waitingTrigger = void 0;
    this.#trackedEvents.clear();
  }
  #satisfyRequest(request, event) {
    const requestEvent = this.#request.queue.serve(request);
    if (!requestEvent) return;
    event.request = requestEvent;
    event.triggers.add(requestEvent);
  }
  #addTextTrackListeners() {
    this.#onTextTracksChange();
    this.#onTextTrackModeChange();
    const textTracks = this.#media.textTracks;
    new EventsController(textTracks).add("add", this.#onTextTracksChange.bind(this)).add("remove", this.#onTextTracksChange.bind(this)).add("mode-change", this.#onTextTrackModeChange.bind(this));
  }
  #addQualityListeners() {
    const qualities = this.#media.qualities;
    new EventsController(qualities).add("add", this.#onQualitiesChange.bind(this)).add("remove", this.#onQualitiesChange.bind(this)).add("change", this.#onQualityChange.bind(this)).add("auto-change", this.#onAutoQualityChange.bind(this)).add("readonly-change", this.#onCanSetQualityChange.bind(this));
  }
  #addAudioTrackListeners() {
    const audioTracks = this.#media.audioTracks;
    new EventsController(audioTracks).add("add", this.#onAudioTracksChange.bind(this)).add("remove", this.#onAudioTracksChange.bind(this)).add("change", this.#onAudioTrackChange.bind(this));
  }
  #onTextTracksChange(event) {
    const { textTracks } = this.$state;
    textTracks.set(this.#media.textTracks.toArray());
    this.dispatch("text-tracks-change", {
      detail: textTracks(),
      trigger: event
    });
  }
  #onTextTrackModeChange(event) {
    if (event) this.#satisfyRequest("media-text-track-change-request", event);
    const current = this.#media.textTracks.selected, { textTrack } = this.$state;
    if (textTrack() !== current) {
      textTrack.set(current);
      this.dispatch("text-track-change", {
        detail: current,
        trigger: event
      });
    }
  }
  #onAudioTracksChange(event) {
    const { audioTracks } = this.$state;
    audioTracks.set(this.#media.audioTracks.toArray());
    this.dispatch("audio-tracks-change", {
      detail: audioTracks(),
      trigger: event
    });
  }
  #onAudioTrackChange(event) {
    const { audioTrack } = this.$state;
    audioTrack.set(this.#media.audioTracks.selected);
    if (event) this.#satisfyRequest("media-audio-track-change-request", event);
    this.dispatch("audio-track-change", {
      detail: audioTrack(),
      trigger: event
    });
  }
  #onQualitiesChange(event) {
    const { qualities } = this.$state;
    qualities.set(this.#media.qualities.toArray());
    this.dispatch("qualities-change", {
      detail: qualities(),
      trigger: event
    });
  }
  #onQualityChange(event) {
    const { quality } = this.$state;
    quality.set(this.#media.qualities.selected);
    if (event) this.#satisfyRequest("media-quality-change-request", event);
    this.dispatch("quality-change", {
      detail: quality(),
      trigger: event
    });
  }
  #onAutoQualityChange() {
    const { qualities } = this.#media, isAuto = qualities.auto;
    this.$state.autoQuality.set(isAuto);
    if (!isAuto) this.#stopWatchingQualityResize();
  }
  #stopQualityResizeEffect = null;
  #watchQualityResize() {
    this.#stopWatchingQualityResize();
    this.#stopQualityResizeEffect = effect(() => {
      const { qualities } = this.#media, { mediaWidth, mediaHeight } = this.$state, w = mediaWidth(), h = mediaHeight();
      if (w === 0 || h === 0) return;
      let selectedQuality = null, minScore = Infinity;
      for (const quality of qualities) {
        const score = Math.abs(quality.width - w) + Math.abs(quality.height - h);
        if (score < minScore) {
          minScore = score;
          selectedQuality = quality;
        }
      }
      if (selectedQuality) {
        qualities[ListSymbol.select](
          selectedQuality,
          true,
          new DOMEvent("resize", { detail: { width: w, height: h } })
        );
      }
    });
  }
  #stopWatchingQualityResize() {
    this.#stopQualityResizeEffect?.();
    this.#stopQualityResizeEffect = null;
  }
  #onCanSetQualityChange() {
    this.$state.canSetQuality.set(!this.#media.qualities.readonly);
  }
  #watchCanSetVolume() {
    const { canSetVolume, isGoogleCastConnected } = this.$state;
    if (isGoogleCastConnected()) {
      canSetVolume.set(false);
      return;
    }
    canChangeVolume().then(canSetVolume.set);
  }
  ["provider-change"](event) {
    const prevProvider = this.#media.$provider(), newProvider = event.detail;
    if (prevProvider?.type === newProvider?.type) return;
    prevProvider?.destroy?.();
    prevProvider?.scope?.dispose();
    this.#media.$provider.set(event.detail);
    if (prevProvider && event.detail === null) {
      this.#resetMediaState(event);
    }
  }
  ["provider-loader-change"](event) {
    {
      this.#media.logger?.infoGroup(`Loader change \`${event.detail?.constructor.name}\``).labelledLog("Event", event).dispatch();
    }
  }
  ["auto-play"](event) {
    this.$state.autoPlayError.set(null);
  }
  ["auto-play-fail"](event) {
    this.$state.autoPlayError.set(event.detail);
    this.#resetTracking();
  }
  ["can-load"](event) {
    this.$state.canLoad.set(true);
    this.#trackedEvents.set("can-load", event);
    this.#media.textTracks[TextTrackSymbol.canLoad]();
    this.#satisfyRequest("media-start-loading", event);
  }
  ["can-load-poster"](event) {
    this.$state.canLoadPoster.set(true);
    this.#trackedEvents.set("can-load-poster", event);
    this.#satisfyRequest("media-poster-start-loading", event);
  }
  ["media-type-change"](event) {
    const sourceChangeEvent = this.#trackedEvents.get("source-change");
    if (sourceChangeEvent) event.triggers.add(sourceChangeEvent);
    const viewType = this.$state.viewType();
    this.$state.mediaType.set(event.detail);
    const providedViewType = this.$state.providedViewType(), currentViewType = providedViewType === "unknown" ? event.detail : providedViewType;
    if (viewType !== currentViewType) {
      {
        setTimeout(() => {
          requestAnimationFrame(() => {
            if (!this.scope) return;
            this.$state.inferredViewType.set(event.detail);
            this.dispatch("view-type-change", {
              detail: currentViewType,
              trigger: event
            });
          });
        }, 0);
      }
    }
  }
  ["stream-type-change"](event) {
    const sourceChangeEvent = this.#trackedEvents.get("source-change");
    if (sourceChangeEvent) event.triggers.add(sourceChangeEvent);
    const { streamType, inferredStreamType } = this.$state;
    inferredStreamType.set(event.detail);
    event.detail = streamType();
  }
  ["rate-change"](event) {
    const { storage } = this.#media, { canPlay } = this.$state;
    this.$state.playbackRate.set(event.detail);
    this.#satisfyRequest("media-rate-change-request", event);
    if (canPlay()) {
      storage?.setPlaybackRate?.(event.detail);
    }
  }
  ["remote-playback-change"](event) {
    const { remotePlaybackState, remotePlaybackType } = this.$state, { type, state } = event.detail, isConnected = state === "connected";
    remotePlaybackType.set(type);
    remotePlaybackState.set(state);
    const key = type === "airplay" ? "media-airplay-request" : "media-google-cast-request";
    if (isConnected) {
      this.#satisfyRequest(key, event);
    } else {
      const requestEvent = this.#request.queue.peek(key);
      if (requestEvent) {
        event.request = requestEvent;
        event.triggers.add(requestEvent);
      }
    }
  }
  ["sources-change"](event) {
    const prevSources = this.$state.sources(), newSources = event.detail;
    this.$state.sources.set(newSources);
    this.#onSourceQualitiesChange(prevSources, newSources, event);
  }
  #onSourceQualitiesChange(prevSources, newSources, trigger) {
    let { qualities } = this.#media, added = false, removed = false;
    for (const prevSrc of prevSources) {
      if (!isVideoQualitySrc(prevSrc)) continue;
      const exists = newSources.some((s) => s.src === prevSrc.src);
      if (!exists) {
        const quality = qualities.getBySrc(prevSrc.src);
        if (quality) {
          qualities[ListSymbol.remove](quality, trigger);
          removed = true;
        }
      }
    }
    if (removed && !qualities.length) {
      this.$state.savedState.set(null);
      qualities[ListSymbol.reset](trigger);
    }
    for (const src of newSources) {
      if (!isVideoQualitySrc(src) || qualities.getBySrc(src.src)) continue;
      const quality = {
        id: src.id ?? src.height + "p",
        bitrate: null,
        codec: null,
        ...src,
        selected: false
      };
      qualities[ListSymbol.add](quality, trigger);
      added = true;
    }
    if (added && !qualities[QualitySymbol.enableAuto]) {
      this.#watchQualityResize();
      qualities[QualitySymbol.enableAuto] = this.#watchQualityResize.bind(this);
      qualities[QualitySymbol.setAuto](true, trigger);
    }
  }
  ["source-change"](event) {
    event.isQualityChange = event.originEvent?.type === "quality-change";
    const source = event.detail;
    this.#resetMediaState(event, event.isQualityChange);
    this.#trackedEvents.set(event.type, event);
    this.$state.source.set(source);
    this.el?.setAttribute("aria-busy", "true");
    {
      this.#media.logger?.infoGroup("\u{1F4FC} Media source change").labelledLog("Source", source).dispatch();
    }
  }
  #resetMediaState(event, isSourceQualityChange = false) {
    const { audioTracks, qualities } = this.#media;
    if (!isSourceQualityChange) {
      this.#playedIntervals = [];
      this.#playedInterval = [-1, -1];
      audioTracks[ListSymbol.reset](event);
      qualities[ListSymbol.reset](event);
      softResetMediaState(this.$state, isSourceQualityChange);
      this.#resetTracking();
      return;
    }
    softResetMediaState(this.$state, isSourceQualityChange);
    this.#resetTracking();
  }
  ["abort"](event) {
    const sourceChangeEvent = this.#trackedEvents.get("source-change");
    if (sourceChangeEvent) event.triggers.add(sourceChangeEvent);
    const canLoadEvent = this.#trackedEvents.get("can-load");
    if (canLoadEvent && !event.triggers.hasType("can-load")) {
      event.triggers.add(canLoadEvent);
    }
  }
  ["load-start"](event) {
    const sourceChangeEvent = this.#trackedEvents.get("source-change");
    if (sourceChangeEvent) event.triggers.add(sourceChangeEvent);
  }
  ["error"](event) {
    this.$state.error.set(event.detail);
    const abortEvent = this.#trackedEvents.get("abort");
    if (abortEvent) event.triggers.add(abortEvent);
    {
      this.#media.logger?.errorGroup("Media Error").labelledLog("Error", event.detail).labelledLog("Event", event).labelledLog("Context", this.#media).dispatch();
    }
  }
  ["loaded-metadata"](event) {
    const loadStartEvent = this.#trackedEvents.get("load-start");
    if (loadStartEvent) event.triggers.add(loadStartEvent);
  }
  ["loaded-data"](event) {
    const loadStartEvent = this.#trackedEvents.get("load-start");
    if (loadStartEvent) event.triggers.add(loadStartEvent);
  }
  ["can-play"](event) {
    const loadedMetadata = this.#trackedEvents.get("loaded-metadata");
    if (loadedMetadata) event.triggers.add(loadedMetadata);
    this.#onCanPlayDetail(event.detail);
    this.el?.setAttribute("aria-busy", "false");
  }
  ["can-play-through"](event) {
    this.#onCanPlayDetail(event.detail);
    const canPlay = this.#trackedEvents.get("can-play");
    if (canPlay) event.triggers.add(canPlay);
  }
  #onCanPlayDetail(detail) {
    const { seekable, buffered, intrinsicDuration, canPlay } = this.$state;
    canPlay.set(true);
    buffered.set(detail.buffered);
    seekable.set(detail.seekable);
    const seekableEnd = getTimeRangesEnd(detail.seekable) ?? Infinity;
    intrinsicDuration.set(seekableEnd);
  }
  ["duration-change"](event) {
    const { live, intrinsicDuration, providedDuration, clipEndTime, ended } = this.$state, time = event.detail;
    if (!live()) {
      const duration = !Number.isNaN(time) ? time : 0;
      intrinsicDuration.set(duration);
      if (ended()) this.#onEndPrecisionChange(event);
    }
    if (providedDuration() > 0 || clipEndTime() > 0) {
      event.stopImmediatePropagation();
    }
  }
  ["progress"](event) {
    const { buffered, seekable } = this.$state, { buffered: newBuffered, seekable: newSeekable } = event.detail, newBufferedEnd = getTimeRangesEnd(newBuffered), hasBufferedLengthChanged = newBuffered.length !== buffered().length, hasBufferedEndChanged = newBufferedEnd !== getTimeRangesEnd(buffered()), newSeekableEnd = getTimeRangesEnd(newSeekable), hasSeekableLengthChanged = newSeekable.length !== seekable().length, hasSeekableEndChanged = newSeekableEnd !== getTimeRangesEnd(seekable());
    if (hasBufferedLengthChanged || hasBufferedEndChanged) {
      buffered.set(newBuffered);
    }
    if (hasSeekableLengthChanged || hasSeekableEndChanged) {
      seekable.set(newSeekable);
    }
  }
  ["play"](event) {
    const {
      paused,
      autoPlayError,
      ended,
      autoPlaying,
      playsInline,
      pointer,
      muted,
      viewType,
      live,
      userBehindLiveEdge
    } = this.$state;
    this.#resetPlaybackIfNeeded();
    if (!paused()) {
      event.stopImmediatePropagation();
      return;
    }
    event.autoPlay = autoPlaying();
    const waitingEvent = this.#trackedEvents.get("waiting");
    if (waitingEvent) event.triggers.add(waitingEvent);
    this.#satisfyRequest("media-play-request", event);
    this.#trackedEvents.set("play", event);
    paused.set(false);
    autoPlayError.set(null);
    if (event.autoPlay) {
      this.handle(
        this.createEvent("auto-play", {
          detail: { muted: muted() },
          trigger: event
        })
      );
      autoPlaying.set(false);
    }
    if (ended() || this.#request.replaying) {
      this.#request.replaying = false;
      ended.set(false);
      this.handle(this.createEvent("replay", { trigger: event }));
    }
    if (!playsInline() && viewType() === "video" && pointer() === "coarse") {
      this.#media.remote.enterFullscreen("prefer-media", event);
    }
    if (live() && !userBehindLiveEdge()) {
      this.#media.remote.seekToLiveEdge(event);
    }
  }
  #resetPlaybackIfNeeded(trigger) {
    const provider = peek(this.#media.$provider);
    if (!provider) return;
    const { ended, seekableStart, clipEndTime, currentTime, realCurrentTime, duration } = this.$state;
    const shouldReset = ended() || realCurrentTime() < seekableStart() || clipEndTime() > 0 && realCurrentTime() >= clipEndTime() || Math.abs(currentTime() - duration()) < 0.1;
    if (shouldReset) {
      this.dispatch("media-seek-request", {
        detail: seekableStart(),
        trigger
      });
    }
    return shouldReset;
  }
  ["play-fail"](event) {
    const { muted, autoPlaying } = this.$state;
    const playEvent = this.#trackedEvents.get("play");
    if (playEvent) event.triggers.add(playEvent);
    this.#satisfyRequest("media-play-request", event);
    const { paused, playing } = this.$state;
    paused.set(true);
    playing.set(false);
    this.#resetTracking();
    this.#trackedEvents.set("play-fail", event);
    if (event.autoPlay) {
      this.handle(
        this.createEvent("auto-play-fail", {
          detail: {
            muted: muted(),
            error: event.detail
          },
          trigger: event
        })
      );
      autoPlaying.set(false);
    }
  }
  ["playing"](event) {
    const playEvent = this.#trackedEvents.get("play"), seekedEvent = this.#trackedEvents.get("seeked");
    if (playEvent) event.triggers.add(playEvent);
    else if (seekedEvent) event.triggers.add(seekedEvent);
    setTimeout(() => this.#resetTracking(), 0);
    const {
      paused,
      playing,
      live,
      liveSyncPosition,
      seekableEnd,
      started,
      currentTime,
      seeking,
      ended
    } = this.$state;
    paused.set(false);
    playing.set(true);
    seeking.set(false);
    ended.set(false);
    if (this.#request.looping) {
      this.#request.looping = false;
      return;
    }
    if (live() && !started() && currentTime() === 0) {
      const end = liveSyncPosition() ?? seekableEnd() - 2;
      if (Number.isFinite(end)) this.#media.$provider().setCurrentTime(end);
    }
    this["started"](event);
  }
  ["started"](event) {
    const { started } = this.$state;
    if (!started()) {
      started.set(true);
      this.handle(this.createEvent("started", { trigger: event }));
    }
  }
  ["pause"](event) {
    if (!this.el?.isConnected) {
      this.#isPlayingOnDisconnect = true;
    }
    this.#satisfyRequest("media-pause-request", event);
    const seekedEvent = this.#trackedEvents.get("seeked");
    if (seekedEvent) event.triggers.add(seekedEvent);
    const { paused, playing } = this.$state;
    paused.set(true);
    playing.set(false);
    if (this.#clipEnded) {
      setTimeout(() => {
        this.handle(this.createEvent("end", { trigger: event }));
        this.#clipEnded = false;
      }, 0);
    }
    this.#resetTracking();
  }
  ["time-change"](event) {
    if (this.#request.looping) {
      event.stopImmediatePropagation();
      return;
    }
    let { waiting, played, clipEndTime, realCurrentTime, currentTime } = this.$state, newTime = event.detail, endTime = clipEndTime();
    realCurrentTime.set(newTime);
    this.#updatePlayed();
    waiting.set(false);
    for (const track of this.#media.textTracks) {
      track[TextTrackSymbol.updateActiveCues](newTime, event);
    }
    if (endTime > 0 && newTime >= endTime) {
      this.#clipEnded = true;
      this.dispatch("media-pause-request", { trigger: event });
    }
    this.#saveTime();
    this.dispatch("time-update", {
      detail: { currentTime: currentTime(), played: played() },
      trigger: event
    });
  }
  #updatePlayed() {
    const { currentTime, played, paused } = this.$state;
    if (paused()) return;
    this.#playedInterval = updateTimeIntervals(
      this.#playedIntervals,
      this.#playedInterval,
      currentTime()
    );
    played.set(new TimeRange(this.#playedIntervals));
  }
  // Called to update time again incase duration precision has changed.
  #onEndPrecisionChange(trigger) {
    const { clipStartTime, clipEndTime, duration } = this.$state, isClipped = clipStartTime() > 0 || clipEndTime() > 0;
    if (isClipped) return;
    this.handle(
      this.createEvent("time-change", {
        detail: duration(),
        trigger
      })
    );
  }
  #saveTime() {
    const { storage } = this.#media, { canPlay, realCurrentTime } = this.$state;
    if (canPlay()) {
      storage?.setTime?.(realCurrentTime());
    }
  }
  ["audio-gain-change"](event) {
    const { storage } = this.#media, { canPlay, audioGain } = this.$state;
    audioGain.set(event.detail);
    this.#satisfyRequest("media-audio-gain-change-request", event);
    if (canPlay()) storage?.setAudioGain?.(audioGain());
  }
  ["volume-change"](event) {
    const { storage } = this.#media, { volume, muted, canPlay } = this.$state, detail = event.detail;
    volume.set(detail.volume);
    muted.set(detail.muted || detail.volume === 0);
    this.#satisfyRequest("media-volume-change-request", event);
    this.#satisfyRequest(detail.muted ? "media-mute-request" : "media-unmute-request", event);
    if (canPlay()) {
      storage?.setVolume?.(volume());
      storage?.setMuted?.(muted());
    }
  }
  ["seeking"] = functionThrottle(
    (event) => {
      const { seeking, realCurrentTime, paused } = this.$state;
      seeking.set(true);
      realCurrentTime.set(event.detail);
      this.#satisfyRequest("media-seeking-request", event);
      if (paused()) {
        this.#waitingTrigger = event;
        this.#fireWaiting();
      }
      this.#playedInterval = [-1, -1];
    },
    150,
    { leading: true }
  );
  ["seeked"](event) {
    const { seeking, currentTime, realCurrentTime, paused, seekableEnd, ended, live } = this.$state;
    if (this.#request.seeking) {
      seeking.set(true);
      event.stopImmediatePropagation();
    } else if (seeking()) {
      const waitingEvent = this.#trackedEvents.get("waiting");
      if (waitingEvent) event.triggers.add(waitingEvent);
      const seekingEvent = this.#trackedEvents.get("seeking");
      if (seekingEvent && !event.triggers.has(seekingEvent)) {
        event.triggers.add(seekingEvent);
      }
      if (paused()) this.#stopWaiting();
      seeking.set(false);
      realCurrentTime.set(event.detail);
      this.#satisfyRequest("media-seek-request", event);
      const origin = event?.originEvent;
      if (origin?.isTrusted && !(origin instanceof MessageEvent) && !/seek/.test(origin.type)) {
        this["started"](event);
      }
    }
    if (!live()) {
      if (Math.floor(currentTime()) !== Math.floor(seekableEnd())) {
        ended.set(false);
      } else {
        this.end(event);
      }
    }
  }
  ["waiting"](event) {
    if (this.#firingWaiting || this.#request.seeking) return;
    event.stopImmediatePropagation();
    this.#waitingTrigger = event;
    this.#fireWaiting();
  }
  #fireWaiting = functionDebounce(() => {
    if (!this.#waitingTrigger) return;
    this.#firingWaiting = true;
    const { waiting, playing } = this.$state;
    waiting.set(true);
    playing.set(false);
    const event = this.createEvent("waiting", { trigger: this.#waitingTrigger });
    this.#trackedEvents.set("waiting", event);
    this.dispatch(event);
    this.#waitingTrigger = void 0;
    this.#firingWaiting = false;
  }, 300);
  ["end"](event) {
    const { loop, ended } = this.$state;
    if (!loop() && ended()) return;
    if (loop()) {
      setTimeout(() => {
        requestAnimationFrame(() => {
          this.#resetPlaybackIfNeeded(event);
          this.dispatch("media-loop-request", { trigger: event });
        });
      }, 10);
      return;
    }
    setTimeout(() => this.#onEnded(event), 0);
  }
  #onEnded(event) {
    const { storage } = this.#media, { paused, seeking, ended, duration } = this.$state;
    this.#onEndPrecisionChange(event);
    if (!paused()) {
      this.dispatch("pause", { trigger: event });
    }
    if (seeking()) {
      this.dispatch("seeked", {
        detail: duration(),
        trigger: event
      });
    }
    ended.set(true);
    this.#resetTracking();
    storage?.setTime?.(duration(), true);
    this.dispatch("ended", {
      trigger: event
    });
  }
  #stopWaiting() {
    this.#fireWaiting.cancel();
    this.$state.waiting.set(false);
  }
  ["fullscreen-change"](event) {
    const isFullscreen = event.detail;
    this.$state.fullscreen.set(isFullscreen);
    this.#satisfyRequest(
      isFullscreen ? "media-enter-fullscreen-request" : "media-exit-fullscreen-request",
      event
    );
  }
  ["fullscreen-error"](event) {
    this.#satisfyRequest("media-enter-fullscreen-request", event);
    this.#satisfyRequest("media-exit-fullscreen-request", event);
  }
  ["orientation-change"](event) {
    const isLocked = event.detail.lock;
    this.#satisfyRequest(
      isLocked ? "media-orientation-lock-request" : "media-orientation-unlock-request",
      event
    );
  }
  ["picture-in-picture-change"](event) {
    const isPiP = event.detail;
    this.$state.pictureInPicture.set(isPiP);
    this.#satisfyRequest(isPiP ? "media-enter-pip-request" : "media-exit-pip-request", event);
  }
  ["picture-in-picture-error"](event) {
    this.#satisfyRequest("media-enter-pip-request", event);
    this.#satisfyRequest("media-exit-pip-request", event);
  }
  ["title-change"](event) {
    if (!event.trigger) return;
    event.stopImmediatePropagation();
    this.$state.inferredTitle.set(event.detail);
  }
  ["poster-change"](event) {
    if (!event.trigger) return;
    event.stopImmediatePropagation();
    this.$state.inferredPoster.set(event.detail);
  }
}

class MediaStateSync extends MediaPlayerController {
  onSetup() {
    this.#init();
    effect(this.#watchLogLevel.bind(this));
    const effects = [
      this.#watchMetadata,
      this.#watchAutoplay,
      this.#watchClipStartTime,
      this.#watchClipEndTime,
      this.#watchControls,
      this.#watchCrossOrigin,
      this.#watchDuration,
      this.#watchLive,
      this.#watchLiveEdge,
      this.#watchLiveTolerance,
      this.#watchLoop,
      this.#watchPlaysInline,
      this.#watchPoster,
      this.#watchProvidedTypes,
      this.#watchTitle
    ];
    for (const callback of effects) {
      effect(callback.bind(this));
    }
  }
  #init() {
    const providedProps = {
      duration: "providedDuration",
      loop: "providedLoop",
      poster: "providedPoster",
      streamType: "providedStreamType",
      title: "providedTitle",
      viewType: "providedViewType"
    };
    const skip = /* @__PURE__ */ new Set([
      "currentTime",
      "paused",
      "playbackRate",
      "volume"
    ]);
    for (const prop of Object.keys(this.$props)) {
      if (skip.has(prop)) continue;
      this.$state[providedProps[prop] ?? prop]?.set(this.$props[prop]());
    }
    this.$state.muted.set(this.$props.muted() || this.$props.volume() === 0);
  }
  // Sync "provided" props with internal state. Provided props are used to differentiate from
  // provider inferred values.
  #watchProvidedTypes() {
    const { viewType, streamType, title, poster, loop } = this.$props, $state = this.$state;
    $state.providedPoster.set(poster());
    $state.providedStreamType.set(streamType());
    $state.providedViewType.set(viewType());
    $state.providedTitle.set(title());
    $state.providedLoop.set(loop());
  }
  #watchLogLevel() {
    this.$state.logLevel.set(this.$props.logLevel());
  }
  #watchMetadata() {
    const { artist, artwork } = this.$props;
    this.$state.artist.set(artist());
    this.$state.artwork.set(artwork());
  }
  #watchTitle() {
    const { title } = this.$state;
    this.dispatch("title-change", { detail: title() });
  }
  #watchAutoplay() {
    const autoPlay = this.$props.autoPlay() || this.$props.autoplay();
    this.$state.autoPlay.set(autoPlay);
    this.dispatch("auto-play-change", { detail: autoPlay });
  }
  #watchLoop() {
    const loop = this.$state.loop();
    this.dispatch("loop-change", { detail: loop });
  }
  #watchControls() {
    const controls = this.$props.controls();
    this.$state.controls.set(controls);
  }
  #watchPoster() {
    const { poster } = this.$state;
    this.dispatch("poster-change", { detail: poster() });
  }
  #watchCrossOrigin() {
    const crossOrigin = this.$props.crossOrigin() ?? this.$props.crossorigin(), value = crossOrigin === true ? "" : crossOrigin;
    this.$state.crossOrigin.set(value);
  }
  #watchDuration() {
    const { duration } = this.$props;
    this.dispatch("media-duration-change-request", {
      detail: duration()
    });
  }
  #watchPlaysInline() {
    const inline = this.$props.playsInline() || this.$props.playsinline();
    this.$state.playsInline.set(inline);
    this.dispatch("plays-inline-change", { detail: inline });
  }
  #watchClipStartTime() {
    const { clipStartTime } = this.$props;
    this.dispatch("media-clip-start-change-request", {
      detail: clipStartTime()
    });
  }
  #watchClipEndTime() {
    const { clipEndTime } = this.$props;
    this.dispatch("media-clip-end-change-request", {
      detail: clipEndTime()
    });
  }
  #watchLive() {
    this.dispatch("live-change", { detail: this.$state.live() });
  }
  #watchLiveTolerance() {
    this.$state.liveEdgeTolerance.set(this.$props.liveEdgeTolerance());
    this.$state.minLiveDVRWindow.set(this.$props.minLiveDVRWindow());
  }
  #watchLiveEdge() {
    this.dispatch("live-edge-change", { detail: this.$state.liveEdge() });
  }
}

class LocalMediaStorage {
  playerId = "vds-player";
  mediaId = null;
  #data = {
    volume: null,
    muted: null,
    audioGain: null,
    time: null,
    lang: null,
    captions: null,
    rate: null,
    quality: null
  };
  async getVolume() {
    return this.#data.volume;
  }
  async setVolume(volume) {
    this.#data.volume = volume;
    this.save();
  }
  async getMuted() {
    return this.#data.muted;
  }
  async setMuted(muted) {
    this.#data.muted = muted;
    this.save();
  }
  async getTime() {
    return this.#data.time;
  }
  async setTime(time, ended) {
    const shouldClear = time < 0;
    this.#data.time = !shouldClear ? time : null;
    if (shouldClear || ended) this.saveTime();
    else this.saveTimeThrottled();
  }
  async getLang() {
    return this.#data.lang;
  }
  async setLang(lang) {
    this.#data.lang = lang;
    this.save();
  }
  async getCaptions() {
    return this.#data.captions;
  }
  async setCaptions(enabled) {
    this.#data.captions = enabled;
    this.save();
  }
  async getPlaybackRate() {
    return this.#data.rate;
  }
  async setPlaybackRate(rate) {
    this.#data.rate = rate;
    this.save();
  }
  async getAudioGain() {
    return this.#data.audioGain;
  }
  async setAudioGain(gain) {
    this.#data.audioGain = gain;
    this.save();
  }
  async getVideoQuality() {
    return this.#data.quality;
  }
  async setVideoQuality(quality) {
    this.#data.quality = quality;
    this.save();
  }
  onChange(src, mediaId, playerId = "vds-player") {
    const savedData = playerId ? localStorage.getItem(playerId) : null, savedTime = mediaId ? localStorage.getItem(mediaId) : null;
    this.playerId = playerId;
    this.mediaId = mediaId;
    this.#data = {
      volume: null,
      muted: null,
      audioGain: null,
      lang: null,
      captions: null,
      rate: null,
      quality: null,
      ...savedData ? JSON.parse(savedData) : {},
      time: savedTime ? +savedTime : null
    };
  }
  save() {
    if (!this.playerId) return;
    const data = JSON.stringify({ ...this.#data, time: void 0 });
    localStorage.setItem(this.playerId, data);
  }
  saveTimeThrottled = functionThrottle(this.saveTime.bind(this), 1e3);
  saveTime() {
    if (!this.mediaId) return;
    const data = (this.#data.time ?? 0).toString();
    localStorage.setItem(this.mediaId, data);
  }
}

const actions = ["play", "pause", "seekforward", "seekbackward", "seekto"];
class NavigatorMediaSession extends MediaPlayerController {
  onConnect() {
    effect(this.#onMetadataChange.bind(this));
    effect(this.#onPlaybackStateChange.bind(this));
    const handleAction = this.#handleAction.bind(this);
    for (const action of actions) {
      navigator.mediaSession.setActionHandler(action, handleAction);
    }
    onDispose(this.#onDisconnect.bind(this));
  }
  #onDisconnect() {
    for (const action of actions) {
      navigator.mediaSession.setActionHandler(action, null);
    }
  }
  #onMetadataChange() {
    const { title, artist, artwork, poster } = this.$state;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title(),
      artist: artist(),
      artwork: artwork() ?? [{ src: poster() }]
    });
  }
  #onPlaybackStateChange() {
    const { canPlay, paused } = this.$state;
    navigator.mediaSession.playbackState = !canPlay() ? "none" : paused() ? "paused" : "playing";
  }
  #handleAction(details) {
    const trigger = new DOMEvent(`media-session-action`, { detail: details });
    switch (details.action) {
      case "play":
        this.dispatch("media-play-request", { trigger });
        break;
      case "pause":
        this.dispatch("media-pause-request", { trigger });
        break;
      case "seekto":
      case "seekforward":
      case "seekbackward":
        this.dispatch("media-seek-request", {
          detail: isNumber(details.seekTime) ? details.seekTime : this.$state.currentTime() + (details.seekOffset ?? (details.action === "seekforward" ? 10 : -10)),
          trigger
        });
        break;
    }
  }
}

const GROUPED_LOG = Symbol("GROUPED_LOG" );
class GroupedLog {
  constructor(logger, level, title, root, parent) {
    this.logger = logger;
    this.level = level;
    this.title = title;
    this.root = root;
    this.parent = parent;
  }
  [GROUPED_LOG] = true;
  logs = [];
  log(...data) {
    this.logs.push({ data });
    return this;
  }
  labelledLog(label, ...data) {
    this.logs.push({ label, data });
    return this;
  }
  groupStart(title) {
    return new GroupedLog(this.logger, this.level, title, this.root ?? this, this);
  }
  groupEnd() {
    this.parent?.logs.push(this);
    return this.parent ?? this;
  }
  dispatch() {
    return this.logger.dispatch(this.level, this.root ?? this);
  }
}
function isGroupedLog(data) {
  return !!data?.[GROUPED_LOG];
}

class Logger {
  #target = null;
  error(...data) {
    return this.dispatch("error", ...data);
  }
  warn(...data) {
    return this.dispatch("warn", ...data);
  }
  info(...data) {
    return this.dispatch("info", ...data);
  }
  debug(...data) {
    return this.dispatch("debug", ...data);
  }
  errorGroup(title) {
    return new GroupedLog(this, "error", title);
  }
  warnGroup(title) {
    return new GroupedLog(this, "warn", title);
  }
  infoGroup(title) {
    return new GroupedLog(this, "info", title);
  }
  debugGroup(title) {
    return new GroupedLog(this, "debug", title);
  }
  setTarget(newTarget) {
    this.#target = newTarget;
  }
  dispatch(level, ...data) {
    return this.#target?.dispatchEvent(
      new DOMEvent("vds-log", {
        bubbles: true,
        composed: true,
        detail: { level, data }
      })
    ) || false;
  }
}

class MediaRemoteControl {
  #target = null;
  #player = null;
  #prevTrackIndex = -1;
  #logger;
  constructor(logger = new Logger() ) {
    this.#logger = logger;
  }
  /**
   * Set the target from which to dispatch media requests events from. The events should bubble
   * up from this target to the player element.
   *
   * @example
   * ```ts
   * const button = document.querySelector('button');
   * remote.setTarget(button);
   * ```
   */
  setTarget(target) {
    this.#target = target;
    this.#logger?.setTarget(target);
  }
  /**
   * Returns the current player element. This method will attempt to find the player by
   * searching up from either the given `target` or default target set via `remote.setTarget`.
   *
   * @example
   * ```ts
   * const player = remote.getPlayer();
   * ```
   */
  getPlayer(target) {
    if (this.#player) return this.#player;
    (target ?? this.#target)?.dispatchEvent(
      new DOMEvent("find-media-player", {
        detail: (player) => void (this.#player = player),
        bubbles: true,
        composed: true
      })
    );
    return this.#player;
  }
  /**
   * Set the current player element so the remote can support toggle methods such as
   * `togglePaused` as they rely on the current media state.
   */
  setPlayer(player) {
    this.#player = player;
  }
  /**
   * Dispatch a request to start the media loading process. This will only work if the media
   * player has been initialized with a custom loading strategy `load="custom">`.
   *
   * @docs {@link https://www.vidstack.io/docs/player/core-concepts/loading#load-strategies}
   */
  startLoading(trigger) {
    this.#dispatchRequest("media-start-loading", trigger);
  }
  /**
   * Dispatch a request to start the poster loading process. This will only work if the media
   * player has been initialized with a custom poster loading strategy `posterLoad="custom">`.
   *
   * @docs {@link https://www.vidstack.io/docs/player/core-concepts/loading#load-strategies}
   */
  startLoadingPoster(trigger) {
    this.#dispatchRequest("media-poster-start-loading", trigger);
  }
  /**
   * Dispatch a request to connect to AirPlay.
   *
   * @see {@link https://www.apple.com/au/airplay}
   */
  requestAirPlay(trigger) {
    this.#dispatchRequest("media-airplay-request", trigger);
  }
  /**
   * Dispatch a request to connect to Google Cast.
   *
   * @see {@link https://developers.google.com/cast/docs/overview}
   */
  requestGoogleCast(trigger) {
    this.#dispatchRequest("media-google-cast-request", trigger);
  }
  /**
   * Dispatch a request to begin/resume media playback.
   */
  play(trigger) {
    this.#dispatchRequest("media-play-request", trigger);
  }
  /**
   * Dispatch a request to pause media playback.
   */
  pause(trigger) {
    this.#dispatchRequest("media-pause-request", trigger);
  }
  /**
   * Dispatch a request to set the media volume to mute (0).
   */
  mute(trigger) {
    this.#dispatchRequest("media-mute-request", trigger);
  }
  /**
   * Dispatch a request to unmute the media volume and set it back to it's previous state.
   */
  unmute(trigger) {
    this.#dispatchRequest("media-unmute-request", trigger);
  }
  /**
   * Dispatch a request to enter fullscreen.
   *
   * @docs {@link https://www.vidstack.io/docs/player/api/fullscreen#remote-control}
   */
  enterFullscreen(target, trigger) {
    this.#dispatchRequest("media-enter-fullscreen-request", trigger, target);
  }
  /**
   * Dispatch a request to exit fullscreen.
   *
   * @docs {@link https://www.vidstack.io/docs/player/api/fullscreen#remote-control}
   */
  exitFullscreen(target, trigger) {
    this.#dispatchRequest("media-exit-fullscreen-request", trigger, target);
  }
  /**
   * Dispatch a request to lock the screen orientation.
   *
   * @docs {@link https://www.vidstack.io/docs/player/screen-orientation#remote-control}
   */
  lockScreenOrientation(lockType, trigger) {
    this.#dispatchRequest("media-orientation-lock-request", trigger, lockType);
  }
  /**
   * Dispatch a request to unlock the screen orientation.
   *
   * @docs {@link https://www.vidstack.io/docs/player/api/screen-orientation#remote-control}
   */
  unlockScreenOrientation(trigger) {
    this.#dispatchRequest("media-orientation-unlock-request", trigger);
  }
  /**
   * Dispatch a request to enter picture-in-picture mode.
   *
   * @docs {@link https://www.vidstack.io/docs/player/api/picture-in-picture#remote-control}
   */
  enterPictureInPicture(trigger) {
    this.#dispatchRequest("media-enter-pip-request", trigger);
  }
  /**
   * Dispatch a request to exit picture-in-picture mode.
   *
   * @docs {@link https://www.vidstack.io/docs/player/api/picture-in-picture#remote-control}
   */
  exitPictureInPicture(trigger) {
    this.#dispatchRequest("media-exit-pip-request", trigger);
  }
  /**
   * Notify the media player that a seeking process is happening and to seek to the given `time`.
   */
  seeking(time, trigger) {
    this.#dispatchRequest("media-seeking-request", trigger, time);
  }
  /**
   * Notify the media player that a seeking operation has completed and to seek to the given `time`.
   * This is generally called after a series of `remote.seeking()` calls.
   */
  seek(time, trigger) {
    this.#dispatchRequest("media-seek-request", trigger, time);
  }
  seekToLiveEdge(trigger) {
    this.#dispatchRequest("media-live-edge-request", trigger);
  }
  /**
   * Dispatch a request to update the length of the media in seconds.
   *
   * @example
   * ```ts
   * remote.changeDuration(100); // 100 seconds
   * ```
   */
  changeDuration(duration, trigger) {
    this.#dispatchRequest("media-duration-change-request", trigger, duration);
  }
  /**
   * Dispatch a request to update the clip start time. This is the time at which media playback
   * should start at.
   *
   * @example
   * ```ts
   * remote.changeClipStart(100); // start at 100 seconds
   * ```
   */
  changeClipStart(startTime, trigger) {
    this.#dispatchRequest("media-clip-start-change-request", trigger, startTime);
  }
  /**
   * Dispatch a request to update the clip end time. This is the time at which media playback
   * should end at.
   *
   * @example
   * ```ts
   * remote.changeClipEnd(100); // end at 100 seconds
   * ```
   */
  changeClipEnd(endTime, trigger) {
    this.#dispatchRequest("media-clip-end-change-request", trigger, endTime);
  }
  /**
   * Dispatch a request to update the media volume to the given `volume` level which is a value
   * between 0 and 1.
   *
   * @docs {@link https://www.vidstack.io/docs/player/api/audio-gain#remote-control}
   * @example
   * ```ts
   * remote.changeVolume(0); // 0%
   * remote.changeVolume(0.05); // 5%
   * remote.changeVolume(0.5); // 50%
   * remote.changeVolume(0.75); // 70%
   * remote.changeVolume(1); // 100%
   * ```
   */
  changeVolume(volume, trigger) {
    this.#dispatchRequest("media-volume-change-request", trigger, Math.max(0, Math.min(1, volume)));
  }
  /**
   * Dispatch a request to change the current audio track.
   *
   * @example
   * ```ts
   * remote.changeAudioTrack(1); // track at index 1
   * ```
   */
  changeAudioTrack(index, trigger) {
    this.#dispatchRequest("media-audio-track-change-request", trigger, index);
  }
  /**
   * Dispatch a request to change the video quality. The special value `-1` represents auto quality
   * selection.
   *
   * @example
   * ```ts
   * remote.changeQuality(-1); // auto
   * remote.changeQuality(1); // quality at index 1
   * ```
   */
  changeQuality(index, trigger) {
    this.#dispatchRequest("media-quality-change-request", trigger, index);
  }
  /**
   * Request auto quality selection.
   */
  requestAutoQuality(trigger) {
    this.changeQuality(-1, trigger);
  }
  /**
   * Dispatch a request to change the mode of the text track at the given index.
   *
   * @example
   * ```ts
   * remote.changeTextTrackMode(1, 'showing'); // track at index 1
   * ```
   */
  changeTextTrackMode(index, mode, trigger) {
    this.#dispatchRequest("media-text-track-change-request", trigger, {
      index,
      mode
    });
  }
  /**
   * Dispatch a request to change the media playback rate.
   *
   * @example
   * ```ts
   * remote.changePlaybackRate(0.5); // Half the normal speed
   * remote.changePlaybackRate(1); // Normal speed
   * remote.changePlaybackRate(1.5); // 50% faster than normal
   * remote.changePlaybackRate(2); // Double the normal speed
   * ```
   */
  changePlaybackRate(rate, trigger) {
    this.#dispatchRequest("media-rate-change-request", trigger, rate);
  }
  /**
   * Dispatch a request to change the media audio gain.
   *
   * @example
   * ```ts
   * remote.changeAudioGain(1); // Disable audio gain
   * remote.changeAudioGain(1.5); // 50% louder
   * remote.changeAudioGain(2); // 100% louder
   * ```
   */
  changeAudioGain(gain, trigger) {
    this.#dispatchRequest("media-audio-gain-change-request", trigger, gain);
  }
  /**
   * Dispatch a request to resume idle tracking on controls.
   */
  resumeControls(trigger) {
    this.#dispatchRequest("media-resume-controls-request", trigger);
  }
  /**
   * Dispatch a request to pause controls idle tracking. Pausing tracking will result in the
   * controls being visible until `remote.resumeControls()` is called. This method
   * is generally used when building custom controls and you'd like to prevent the UI from
   * disappearing.
   *
   * @example
   * ```ts
   * // Prevent controls hiding while menu is being interacted with.
   * function onSettingsOpen() {
   *   remote.pauseControls();
   * }
   *
   * function onSettingsClose() {
   *   remote.resumeControls();
   * }
   * ```
   */
  pauseControls(trigger) {
    this.#dispatchRequest("media-pause-controls-request", trigger);
  }
  /**
   * Dispatch a request to toggle the media playback state.
   */
  togglePaused(trigger) {
    const player = this.getPlayer(trigger?.target);
    if (!player) {
      this.#noPlayerWarning(this.togglePaused.name);
      return;
    }
    if (player.state.paused) this.play(trigger);
    else this.pause(trigger);
  }
  /**
   * Dispatch a request to toggle the controls visibility.
   */
  toggleControls(trigger) {
    const player = this.getPlayer(trigger?.target);
    if (!player) {
      this.#noPlayerWarning(this.toggleControls.name);
      return;
    }
    if (!player.controls.showing) {
      player.controls.show(0, trigger);
    } else {
      player.controls.hide(0, trigger);
    }
  }
  /**
   * Dispatch a request to toggle the media muted state.
   */
  toggleMuted(trigger) {
    const player = this.getPlayer(trigger?.target);
    if (!player) {
      this.#noPlayerWarning(this.toggleMuted.name);
      return;
    }
    if (player.state.muted) this.unmute(trigger);
    else this.mute(trigger);
  }
  /**
   * Dispatch a request to toggle the media fullscreen state.
   *
   * @docs {@link https://www.vidstack.io/docs/player/api/fullscreen#remote-control}
   */
  toggleFullscreen(target, trigger) {
    const player = this.getPlayer(trigger?.target);
    if (!player) {
      this.#noPlayerWarning(this.toggleFullscreen.name);
      return;
    }
    if (player.state.fullscreen) this.exitFullscreen(target, trigger);
    else this.enterFullscreen(target, trigger);
  }
  /**
   * Dispatch a request to toggle the media picture-in-picture mode.
   *
   * @docs {@link https://www.vidstack.io/docs/player/api/picture-in-picture#remote-control}
   */
  togglePictureInPicture(trigger) {
    const player = this.getPlayer(trigger?.target);
    if (!player) {
      this.#noPlayerWarning(this.togglePictureInPicture.name);
      return;
    }
    if (player.state.pictureInPicture) this.exitPictureInPicture(trigger);
    else this.enterPictureInPicture(trigger);
  }
  /**
   * Show captions.
   */
  showCaptions(trigger) {
    const player = this.getPlayer(trigger?.target);
    if (!player) {
      this.#noPlayerWarning(this.showCaptions.name);
      return;
    }
    let tracks = player.state.textTracks, index = this.#prevTrackIndex;
    if (!tracks[index] || !isTrackCaptionKind(tracks[index])) {
      index = -1;
    }
    if (index === -1) {
      index = tracks.findIndex((track) => isTrackCaptionKind(track) && track.default);
    }
    if (index === -1) {
      index = tracks.findIndex((track) => isTrackCaptionKind(track));
    }
    if (index >= 0) this.changeTextTrackMode(index, "showing", trigger);
    this.#prevTrackIndex = -1;
  }
  /**
   * Turn captions off.
   */
  disableCaptions(trigger) {
    const player = this.getPlayer(trigger?.target);
    if (!player) {
      this.#noPlayerWarning(this.disableCaptions.name);
      return;
    }
    const tracks = player.state.textTracks, track = player.state.textTrack;
    if (track) {
      const index = tracks.indexOf(track);
      this.changeTextTrackMode(index, "disabled", trigger);
      this.#prevTrackIndex = index;
    }
  }
  /**
   * Dispatch a request to toggle the current captions mode.
   */
  toggleCaptions(trigger) {
    const player = this.getPlayer(trigger?.target);
    if (!player) {
      this.#noPlayerWarning(this.toggleCaptions.name);
      return;
    }
    if (player.state.textTrack) {
      this.disableCaptions();
    } else {
      this.showCaptions();
    }
  }
  userPrefersLoopChange(prefersLoop, trigger) {
    this.#dispatchRequest("media-user-loop-change-request", trigger, prefersLoop);
  }
  #dispatchRequest(type, trigger, detail) {
    const request = new DOMEvent(type, {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail,
      trigger
    });
    let target = trigger?.target || null;
    if (target && target instanceof Component) target = target.el;
    const shouldUsePlayer = !target || target === document || target === window || target === document.body || this.#player?.el && target instanceof Node && !this.#player.el.contains(target);
    target = shouldUsePlayer ? this.#target ?? this.getPlayer()?.el : target ?? this.#target;
    {
      this.#logger?.debugGroup(`\u{1F4E8} dispatching \`${type}\``).labelledLog("Target", target).labelledLog("Player", this.#player).labelledLog("Request Event", request).labelledLog("Trigger Event", trigger).dispatch();
    }
    if (this.#player) {
      if (type === "media-play-request" && !this.#player.state.canLoad) {
        target?.dispatchEvent(request);
      } else {
        this.#player.canPlayQueue.enqueue(type, () => target?.dispatchEvent(request));
      }
    } else {
      target?.dispatchEvent(request);
    }
  }
  #noPlayerWarning(method) {
    {
      console.warn(
        `[vidstack] attempted to call \`MediaRemoteControl.${method}\`() that requires player but failed because remote could not find a parent player element from target`
      );
    }
  }
}

class AudioTrackList extends SelectList {
}

class NativeTextRenderer {
  priority = 0;
  #display = true;
  #video = null;
  #track = null;
  #tracks = /* @__PURE__ */ new Set();
  canRender(_, video) {
    return !!video;
  }
  attach(video) {
    this.#video = video;
    if (video) video.textTracks.onchange = this.#onChange.bind(this);
  }
  addTrack(track) {
    this.#tracks.add(track);
    this.#attachTrack(track);
  }
  removeTrack(track) {
    track[TextTrackSymbol.native]?.remove?.();
    track[TextTrackSymbol.native] = null;
    this.#tracks.delete(track);
  }
  changeTrack(track) {
    const current = track?.[TextTrackSymbol.native];
    if (current && current.track.mode !== "showing") {
      current.track.mode = "showing";
    }
    this.#track = track;
  }
  setDisplay(display) {
    this.#display = display;
    this.#onChange();
  }
  detach() {
    if (this.#video) this.#video.textTracks.onchange = null;
    for (const track of this.#tracks) this.removeTrack(track);
    this.#tracks.clear();
    this.#video = null;
    this.#track = null;
  }
  #attachTrack(track) {
    if (!this.#video) return;
    const el = track[TextTrackSymbol.native] ??= this.#createTrackElement(track);
    if (isHTMLElement(el)) {
      this.#video.append(el);
      el.track.mode = el.default ? "showing" : "disabled";
    }
  }
  #createTrackElement(track) {
    const el = document.createElement("track"), isDefault = track.default || track.mode === "showing", isSupported = track.src && track.type === "vtt";
    el.id = track.id;
    el.src = isSupported ? track.src : "";
    el.label = track.label;
    el.kind = track.kind;
    el.default = isDefault;
    track.language && (el.srclang = track.language);
    if (isDefault && !isSupported) {
      this.#copyCues(track, el.track);
    }
    return el;
  }
  #copyCues(track, native) {
    if (track.src && track.type === "vtt" || native.cues?.length) return;
    for (const cue of track.cues) native.addCue(cue);
  }
  #onChange(event) {
    for (const track of this.#tracks) {
      const native = track[TextTrackSymbol.native];
      if (!native) continue;
      if (!this.#display) {
        native.track.mode = native.managed ? "hidden" : "disabled";
        continue;
      }
      const isShowing = native.track.mode === "showing";
      if (isShowing) this.#copyCues(track, native.track);
      track.setMode(isShowing ? "showing" : "disabled", event);
    }
  }
}

class TextRenderers {
  #video = null;
  #textTracks;
  #renderers = [];
  #media;
  #nativeDisplay = false;
  #nativeRenderer = null;
  #customRenderer = null;
  constructor(media) {
    this.#media = media;
    const textTracks = media.textTracks;
    this.#textTracks = textTracks;
    effect(this.#watchControls.bind(this));
    onDispose(this.#detach.bind(this));
    new EventsController(textTracks).add("add", this.#onAddTrack.bind(this)).add("remove", this.#onRemoveTrack.bind(this)).add("mode-change", this.#update.bind(this));
  }
  #watchControls() {
    const { nativeControls } = this.#media.$state;
    this.#nativeDisplay = nativeControls();
    this.#update();
  }
  add(renderer) {
    this.#renderers.push(renderer);
    untrack(this.#update.bind(this));
  }
  remove(renderer) {
    renderer.detach();
    this.#renderers.splice(this.#renderers.indexOf(renderer), 1);
    untrack(this.#update.bind(this));
  }
  /** @internal */
  attachVideo(video) {
    requestAnimationFrame(() => {
      this.#video = video;
      if (video) {
        this.#nativeRenderer = new NativeTextRenderer();
        this.#nativeRenderer.attach(video);
        for (const track of this.#textTracks) this.#addNativeTrack(track);
      }
      this.#update();
    });
  }
  #addNativeTrack(track) {
    if (!isTrackCaptionKind(track)) return;
    this.#nativeRenderer?.addTrack(track);
  }
  #removeNativeTrack(track) {
    if (!isTrackCaptionKind(track)) return;
    this.#nativeRenderer?.removeTrack(track);
  }
  #onAddTrack(event) {
    this.#addNativeTrack(event.detail);
  }
  #onRemoveTrack(event) {
    this.#removeNativeTrack(event.detail);
  }
  #update() {
    const currentTrack = this.#textTracks.selected;
    if (this.#video && (this.#nativeDisplay || currentTrack?.[TextTrackSymbol.nativeHLS])) {
      this.#customRenderer?.changeTrack(null);
      this.#nativeRenderer?.setDisplay(true);
      this.#nativeRenderer?.changeTrack(currentTrack);
      return;
    }
    this.#nativeRenderer?.setDisplay(false);
    this.#nativeRenderer?.changeTrack(null);
    if (!currentTrack) {
      this.#customRenderer?.changeTrack(null);
      return;
    }
    const customRenderer = this.#renderers.sort((a, b) => a.priority - b.priority).find((renderer) => renderer.canRender(currentTrack, this.#video));
    if (this.#customRenderer !== customRenderer) {
      this.#customRenderer?.detach();
      customRenderer?.attach(this.#video);
      this.#customRenderer = customRenderer ?? null;
    }
    customRenderer?.changeTrack(currentTrack);
  }
  #detach() {
    this.#nativeRenderer?.detach();
    this.#nativeRenderer = null;
    this.#customRenderer?.detach();
    this.#customRenderer = null;
  }
}

class TextTrackList extends List {
  #canLoad = false;
  #defaults = {};
  #storage = null;
  #preferredLang = null;
  /** @internal */
  [TextTrackSymbol.crossOrigin];
  constructor() {
    super();
  }
  get selected() {
    const track = this.items.find((t) => t.mode === "showing" && isTrackCaptionKind(t));
    return track ?? null;
  }
  get selectedIndex() {
    const selected = this.selected;
    return selected ? this.indexOf(selected) : -1;
  }
  get preferredLang() {
    return this.#preferredLang;
  }
  set preferredLang(lang) {
    this.#preferredLang = lang;
    this.#saveLang(lang);
  }
  add(init, trigger) {
    const isTrack = init instanceof TextTrack, track = isTrack ? init : new TextTrack(init), kind = init.kind === "captions" || init.kind === "subtitles" ? "captions" : init.kind;
    if (this.#defaults[kind] && init.default) delete init.default;
    track.addEventListener("mode-change", this.#onTrackModeChangeBind);
    this[ListSymbol.add](track, trigger);
    track[TextTrackSymbol.crossOrigin] = this[TextTrackSymbol.crossOrigin];
    if (this.#canLoad) track[TextTrackSymbol.canLoad]();
    if (init.default) this.#defaults[kind] = track;
    this.#selectTracks();
    return this;
  }
  remove(track, trigger) {
    this.#pendingRemoval = track;
    if (!this.items.includes(track)) return;
    if (track === this.#defaults[track.kind]) delete this.#defaults[track.kind];
    track.mode = "disabled";
    track[TextTrackSymbol.onModeChange] = null;
    track.removeEventListener("mode-change", this.#onTrackModeChangeBind);
    this[ListSymbol.remove](track, trigger);
    this.#pendingRemoval = null;
    return this;
  }
  clear(trigger) {
    for (const track of [...this.items]) {
      this.remove(track, trigger);
    }
    return this;
  }
  getByKind(kind) {
    const kinds = Array.isArray(kind) ? kind : [kind];
    return this.items.filter((track) => kinds.includes(track.kind));
  }
  /** @internal */
  [TextTrackSymbol.canLoad]() {
    if (this.#canLoad) return;
    for (const track of this.items) track[TextTrackSymbol.canLoad]();
    this.#canLoad = true;
    this.#selectTracks();
  }
  #selectTracks = functionDebounce(async () => {
    if (!this.#canLoad) return;
    if (!this.#preferredLang && this.#storage) {
      this.#preferredLang = await this.#storage.getLang();
    }
    const showCaptions = await this.#storage?.getCaptions(), kinds = [
      ["captions", "subtitles"],
      "chapters",
      "descriptions",
      "metadata"
    ];
    for (const kind of kinds) {
      const tracks = this.getByKind(kind);
      if (tracks.find((t) => t.mode === "showing")) continue;
      const preferredTrack = this.#preferredLang ? tracks.find((track2) => track2.language === this.#preferredLang) : null;
      const defaultTrack = isArray$1(kind) ? this.#defaults[kind.find((kind2) => this.#defaults[kind2]) || ""] : this.#defaults[kind];
      const track = preferredTrack ?? defaultTrack, isCaptionsKind = track && isTrackCaptionKind(track);
      if (track && (!isCaptionsKind || showCaptions !== false)) {
        track.mode = "showing";
        if (isCaptionsKind) this.#saveCaptionsTrack(track);
      }
    }
  }, 300);
  #pendingRemoval = null;
  #onTrackModeChangeBind = this.#onTrackModeChange.bind(this);
  #onTrackModeChange(event) {
    const track = event.detail;
    if (this.#storage && isTrackCaptionKind(track) && track !== this.#pendingRemoval) {
      this.#saveCaptionsTrack(track);
    }
    if (track.mode === "showing") {
      const kinds = isTrackCaptionKind(track) ? ["captions", "subtitles"] : [track.kind];
      for (const t of this.items) {
        if (t.mode === "showing" && t != track && kinds.includes(t.kind)) {
          t.mode = "disabled";
        }
      }
    }
    this.dispatchEvent(
      new DOMEvent("mode-change", {
        detail: event.detail,
        trigger: event
      })
    );
  }
  #saveCaptionsTrack(track) {
    if (track.mode !== "disabled") {
      this.#saveLang(track.language);
    }
    this.#storage?.setCaptions?.(track.mode === "showing");
  }
  #saveLang(lang) {
    this.#storage?.setLang?.(this.#preferredLang = lang);
  }
  setStorage(storage) {
    this.#storage = storage;
  }
}

const LOCAL_STORAGE_KEY = "@vidstack/log-colors";
const savedColors = init();
function getLogColor(key) {
  return savedColors.get(key);
}
function saveLogColor(key, { color = generateColor(), overwrite = false } = {}) {
  if (!savedColors.has(key) || overwrite) {
    savedColors.set(key, color);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(Object.entries(savedColors)));
  }
}
function generateColor() {
  return `hsl(${Math.random() * 360}, 55%, 70%)`;
}
function init() {
  let colors;
  try {
    colors = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY));
  } catch {
  }
  return new Map(Object.entries(colors ?? {}));
}

const LogLevelValue = Object.freeze({
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
});
const LogLevelColor = Object.freeze({
  silent: "white",
  error: "hsl(6, 58%, 50%)",
  warn: "hsl(51, 58%, 50%)",
  info: "hsl(219, 58%, 50%)",
  debug: "hsl(280, 58%, 50%)"
});

const s = 1e3;
const m = s * 60;
const h = m * 60;
const d$1 = h * 24;
function ms(val) {
  const msAbs = Math.abs(val);
  if (msAbs >= d$1) {
    return Math.round(val / d$1) + "d";
  }
  if (msAbs >= h) {
    return Math.round(val / h) + "h";
  }
  if (msAbs >= m) {
    return Math.round(val / m) + "m";
  }
  if (msAbs >= s) {
    return Math.round(val / s) + "s";
  }
  return round(val, 2) + "ms";
}

class LogPrinter extends ViewController {
  #level = "warn" ;
  #lastLogged;
  /**
   * The current log level.
   */
  get logLevel() {
    return this.#level ;
  }
  set logLevel(level) {
    this.#level = level;
  }
  onConnect() {
    this.listen("vds-log", (event) => {
      event.stopPropagation();
      const element = event.path?.[0] ?? (event.target instanceof ViewController ? event.target.el : event.target), eventTargetName = element?.$$COMPONENT_NAME?.replace(/^_/, "").replace(/Instance$/, "") ?? element?.tagName.toLowerCase() ?? "unknown";
      const { level = "warn", data } = event.detail ?? {};
      if (LogLevelValue[this.#level] < LogLevelValue[level]) {
        return;
      }
      saveLogColor(eventTargetName);
      const hint = data?.length === 1 && isGroupedLog(data[0]) ? data[0].title : isString(data?.[0]) ? data[0] : "";
      console.groupCollapsed(
        `%c${level.toUpperCase()}%c ${eventTargetName}%c ${hint.slice(0, 50)}${hint.length > 50 ? "..." : ""}`,
        `background: ${LogLevelColor[level]}; color: white; padding: 1.5px 2.2px; border-radius: 2px; font-size: 11px;`,
        `color: ${getLogColor(eventTargetName)}; padding: 4px 0px; font-size: 11px;`,
        "color: gray; font-size: 11px; padding-left: 4px;"
      );
      if (data?.length === 1 && isGroupedLog(data[0])) {
        if (element) data[0].logs.unshift({ label: "Element", data: [element] });
        printGroup(level, data[0]);
      } else if (data) {
        print(level, ...data);
      }
      this.#printTimeDiff();
      printStackTrace();
      console.groupEnd();
    });
    onDispose(() => {
      this.#lastLogged = void 0;
    });
  }
  #printTimeDiff() {
    labelledPrint("Time since last log", this.#calcLastLogTimeDiff());
  }
  #calcLastLogTimeDiff() {
    const time = performance.now();
    const diff = time - (this.#lastLogged ?? (this.#lastLogged = performance.now()));
    this.#lastLogged = time;
    return ms(diff);
  }
}
function print(level, ...data) {
  console[level](...data);
}
function labelledPrint(label, ...data) {
  console.log(`%c${label}:`, "color: gray", ...data);
}
function printStackTrace() {
  console.groupCollapsed("%cStack Trace", "color: gray");
  console.trace();
  console.groupEnd();
}
function printGroup(level, groupedLog) {
  for (const log of groupedLog.logs) {
    if (isGroupedLog(log)) {
      console.groupCollapsed(groupedLog.title);
      printGroup(level, log);
      console.groupEnd();
    } else if ("label" in log && !isUndefined(log.label)) {
      labelledPrint(log.label, ...log.data);
    } else {
      print(level, ...log.data);
    }
  }
}

let $keyboard = signal(false);
{
  listenEvent(document, "pointerdown", () => {
    $keyboard.set(false);
  });
  listenEvent(document, "keydown", (e) => {
    if (e.metaKey || e.altKey || e.ctrlKey) return;
    $keyboard.set(true);
  });
}
class FocusVisibleController extends ViewController {
  #focused = signal(false);
  onConnect(el) {
    effect(() => {
      const events = new EventsController(el);
      if (!$keyboard()) {
        this.#focused.set(false);
        updateFocusAttr(el, false);
        events.add("pointerenter", this.#onPointerEnter.bind(this)).add("pointerleave", this.#onPointerLeave.bind(this));
        return;
      }
      const active = document.activeElement === el;
      this.#focused.set(active);
      updateFocusAttr(el, active);
      events.add("focus", this.#onFocus.bind(this)).add("blur", this.#onBlur.bind(this));
    });
  }
  focused() {
    return this.#focused();
  }
  #onFocus() {
    this.#focused.set(true);
    updateFocusAttr(this.el, true);
  }
  #onBlur() {
    this.#focused.set(false);
    updateFocusAttr(this.el, false);
  }
  #onPointerEnter() {
    updateHoverAttr(this.el, true);
  }
  #onPointerLeave() {
    updateHoverAttr(this.el, false);
  }
}
function updateFocusAttr(el, isFocused) {
  setAttribute(el, "data-focus", isFocused);
  setAttribute(el, "data-hocus", isFocused);
}
function updateHoverAttr(el, isHovering) {
  setAttribute(el, "data-hocus", isHovering);
  setAttribute(el, "data-hover", isHovering);
}

class MediaPlayer extends Component {
  static props = mediaPlayerProps;
  static state = mediaState;
  #media;
  #stateMgr;
  #requestMgr;
  canPlayQueue = new RequestQueue();
  remoteControl;
  get #provider() {
    return this.#media.$provider();
  }
  get #props() {
    return this.$props;
  }
  constructor() {
    super();
    new MediaStateSync();
    const context = {
      player: this,
      qualities: new VideoQualityList(),
      audioTracks: new AudioTrackList(),
      storage: null,
      $provider: signal(null),
      $providerSetup: signal(false),
      $props: this.$props,
      $state: this.$state
    };
    {
      const logPrinter = new LogPrinter();
      effect(() => {
        logPrinter.logLevel = this.$props.logLevel();
      });
    }
    context.logger = new Logger();
    context.remote = this.remoteControl = new MediaRemoteControl(
      context.logger 
    );
    context.remote.setPlayer(this);
    context.textTracks = new TextTrackList();
    context.textTracks[TextTrackSymbol.crossOrigin] = this.$state.crossOrigin;
    context.textRenderers = new TextRenderers(context);
    context.ariaKeys = {};
    this.#media = context;
    provideContext(mediaContext, context);
    this.orientation = new ScreenOrientationController();
    new FocusVisibleController();
    new MediaKeyboardController(context);
    new MediaEventsLogger(context);
    const request = new MediaRequestContext();
    this.#stateMgr = new MediaStateManager(request, context);
    this.#requestMgr = new MediaRequestManager(this.#stateMgr, request, context);
    context.delegate = new MediaPlayerDelegate(this.#stateMgr.handle.bind(this.#stateMgr), context);
    context.notify = context.delegate.notify.bind(context.delegate);
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      new NavigatorMediaSession();
    }
    new MediaLoadController("load", this.startLoading.bind(this));
    new MediaLoadController("posterLoad", this.startLoadingPoster.bind(this));
  }
  onSetup() {
    this.#setupMediaAttributes();
    effect(this.#watchCanPlay.bind(this));
    effect(this.#watchMuted.bind(this));
    effect(this.#watchPaused.bind(this));
    effect(this.#watchVolume.bind(this));
    effect(this.#watchCurrentTime.bind(this));
    effect(this.#watchPlaysInline.bind(this));
    effect(this.#watchPlaybackRate.bind(this));
  }
  onAttach(el) {
    el.setAttribute("data-media-player", "");
    setAttributeIfEmpty(el, "tabindex", "0");
    setAttributeIfEmpty(el, "role", "region");
    effect(this.#watchStorage.bind(this));
    effect(this.#watchTitle.bind(this));
    effect(this.#watchOrientation.bind(this));
    listenEvent(el, "find-media-player", this.#onFindPlayer.bind(this));
  }
  onConnect(el) {
    if (IS_IPHONE) setAttribute(el, "data-iphone", "");
    const pointerQuery = window.matchMedia("(pointer: coarse)");
    this.#onPointerChange(pointerQuery);
    pointerQuery.onchange = this.#onPointerChange.bind(this);
    const resize = new ResizeObserver(animationFrameThrottle(this.#onResize.bind(this)));
    resize.observe(el);
    effect(this.#onResize.bind(this));
    this.dispatch("media-player-connect", {
      detail: this,
      bubbles: true,
      composed: true
    });
    this.#media.logger.setTarget(el);
    onDispose(() => {
      resize.disconnect();
      pointerQuery.onchange = null;
      this.#media.logger.setTarget(null);
    });
  }
  onDestroy() {
    this.#media.player = null;
    this.canPlayQueue.reset();
  }
  #skipTitleUpdate = false;
  #watchTitle() {
    const el = this.$el, { title, live, viewType, providedTitle } = this.$state, isLive = live(), type = uppercaseFirstChar(viewType()), typeText = type !== "Unknown" ? `${isLive ? "Live " : ""}${type}` : isLive ? "Live" : "Media", currentTitle = title();
    setAttribute(
      this.el,
      "aria-label",
      `${typeText} Player` + (currentTitle ? ` - ${currentTitle}` : "")
    );
    if (el?.hasAttribute("title")) {
      this.#skipTitleUpdate = true;
      el?.removeAttribute("title");
    }
  }
  #watchOrientation() {
    const orientation = this.orientation.landscape ? "landscape" : "portrait";
    this.$state.orientation.set(orientation);
    setAttribute(this.el, "data-orientation", orientation);
    this.#onResize();
  }
  #watchCanPlay() {
    if (this.$state.canPlay() && this.#provider) this.canPlayQueue.start();
    else this.canPlayQueue.stop();
  }
  #setupMediaAttributes() {
    if (MediaPlayer[MEDIA_ATTRIBUTES]) {
      this.setAttributes(MediaPlayer[MEDIA_ATTRIBUTES]);
      return;
    }
    const $attrs = {
      "data-load": function() {
        return this.$props.load();
      },
      "data-captions": function() {
        const track = this.$state.textTrack();
        return !!track && isTrackCaptionKind(track);
      },
      "data-ios-controls": function() {
        return this.$state.iOSControls();
      },
      "data-controls": function() {
        return this.controls.showing;
      },
      "data-buffering": function() {
        const { canLoad, canPlay, waiting } = this.$state;
        return canLoad() && (!canPlay() || waiting());
      },
      "data-error": function() {
        const { error } = this.$state;
        return !!error();
      },
      "data-autoplay-error": function() {
        const { autoPlayError } = this.$state;
        return !!autoPlayError();
      }
    };
    const alias = {
      autoPlay: "autoplay",
      canAirPlay: "can-airplay",
      canPictureInPicture: "can-pip",
      pictureInPicture: "pip",
      playsInline: "playsinline",
      remotePlaybackState: "remote-state",
      remotePlaybackType: "remote-type",
      isAirPlayConnected: "airplay",
      isGoogleCastConnected: "google-cast"
    };
    for (const prop2 of mediaAttributes) {
      const attrName = "data-" + (alias[prop2] ?? camelToKebabCase(prop2));
      $attrs[attrName] = function() {
        return this.$state[prop2]();
      };
    }
    delete $attrs.title;
    MediaPlayer[MEDIA_ATTRIBUTES] = $attrs;
    this.setAttributes($attrs);
  }
  #onFindPlayer(event) {
    event.detail(this);
  }
  #onResize() {
    if (!this.el) return;
    const width = this.el.clientWidth, height = this.el.clientHeight;
    this.$state.width.set(width);
    this.$state.height.set(height);
    setStyle(this.el, "--player-width", width + "px");
    setStyle(this.el, "--player-height", height + "px");
  }
  #onPointerChange(queryList) {
    const pointer = queryList.matches ? "coarse" : "fine";
    setAttribute(this.el, "data-pointer", pointer);
    this.$state.pointer.set(pointer);
    this.#onResize();
  }
  /**
   * The current media provider.
   */
  get provider() {
    return this.#provider;
  }
  /**
   * Media controls settings.
   */
  get controls() {
    return this.#requestMgr.controls;
  }
  set controls(controls) {
    this.#props.controls.set(controls);
  }
  /**
   * Controls the screen orientation of the current browser window and dispatches orientation
   * change events on the player.
   */
  orientation;
  /**
   * The title of the current media.
   */
  get title() {
    return peek(this.$state.title);
  }
  set title(newTitle) {
    if (this.#skipTitleUpdate) {
      this.#skipTitleUpdate = false;
      return;
    }
    this.#props.title.set(newTitle);
  }
  /**
   * A list of all `VideoQuality` objects representing the set of available video renditions.
   *
   * @see {@link https://vidstack.io/docs/player/api/video-quality}
   */
  get qualities() {
    return this.#media.qualities;
  }
  /**
   * A list of all `AudioTrack` objects representing the set of available audio tracks.
   *
   * @see {@link https://vidstack.io/docs/player/api/audio-tracks}
   */
  get audioTracks() {
    return this.#media.audioTracks;
  }
  /**
   * A list of all `TextTrack` objects representing the set of available text tracks.
   *
   * @see {@link https://vidstack.io/docs/player/api/text-tracks}
   */
  get textTracks() {
    return this.#media.textTracks;
  }
  /**
   * Contains text renderers which are responsible for loading, parsing, and rendering text
   * tracks.
   */
  get textRenderers() {
    return this.#media.textRenderers;
  }
  get duration() {
    return this.$state.duration();
  }
  set duration(duration) {
    this.#props.duration.set(duration);
  }
  get paused() {
    return peek(this.$state.paused);
  }
  set paused(paused) {
    this.#queuePausedUpdate(paused);
  }
  #watchPaused() {
    this.#queuePausedUpdate(this.$props.paused());
  }
  #queuePausedUpdate(paused) {
    if (paused) {
      this.canPlayQueue.enqueue("paused", () => this.#requestMgr.pause());
    } else this.canPlayQueue.enqueue("paused", () => this.#requestMgr.play());
  }
  get muted() {
    return peek(this.$state.muted);
  }
  set muted(muted) {
    this.#queueMutedUpdate(muted);
  }
  #watchMuted() {
    this.#queueMutedUpdate(this.$props.muted());
  }
  #queueMutedUpdate(muted) {
    this.canPlayQueue.enqueue("muted", () => {
      if (this.#provider) this.#provider.setMuted(muted);
    });
  }
  get currentTime() {
    return peek(this.$state.currentTime);
  }
  set currentTime(time) {
    this.#queueCurrentTimeUpdate(time);
  }
  #watchCurrentTime() {
    this.#queueCurrentTimeUpdate(this.$props.currentTime());
  }
  #queueCurrentTimeUpdate(time) {
    this.canPlayQueue.enqueue("currentTime", () => {
      const { currentTime } = this.$state;
      if (time === peek(currentTime)) return;
      peek(() => {
        if (!this.#provider) return;
        const boundedTime = boundTime(time, this.$state);
        if (Number.isFinite(boundedTime)) {
          this.#provider.setCurrentTime(boundedTime);
        }
      });
    });
  }
  get volume() {
    return peek(this.$state.volume);
  }
  set volume(volume) {
    this.#queueVolumeUpdate(volume);
  }
  #watchVolume() {
    this.#queueVolumeUpdate(this.$props.volume());
  }
  #queueVolumeUpdate(volume) {
    const clampedVolume = clampNumber(0, volume, 1);
    this.canPlayQueue.enqueue("volume", () => {
      if (this.#provider) this.#provider.setVolume(clampedVolume);
    });
  }
  get playbackRate() {
    return peek(this.$state.playbackRate);
  }
  set playbackRate(rate) {
    this.#queuePlaybackRateUpdate(rate);
  }
  #watchPlaybackRate() {
    this.#queuePlaybackRateUpdate(this.$props.playbackRate());
  }
  #queuePlaybackRateUpdate(rate) {
    this.canPlayQueue.enqueue("rate", () => {
      if (this.#provider) this.#provider.setPlaybackRate?.(rate);
    });
  }
  #watchPlaysInline() {
    this.#queuePlaysInlineUpdate(this.$props.playsInline());
  }
  #queuePlaysInlineUpdate(inline) {
    this.canPlayQueue.enqueue("playsinline", () => {
      if (this.#provider) this.#provider.setPlaysInline?.(inline);
    });
  }
  #watchStorage() {
    let storageValue = this.$props.storage(), storage = isString(storageValue) ? new LocalMediaStorage() : storageValue;
    if (storage?.onChange) {
      const { source } = this.$state, playerId = isString(storageValue) ? storageValue : this.el?.id, mediaId = computed(this.#computeMediaId.bind(this));
      effect(() => storage.onChange(source(), mediaId(), playerId || void 0));
    }
    this.#media.storage = storage;
    this.#media.textTracks.setStorage(storage);
    onDispose(() => {
      storage?.onDestroy?.();
      this.#media.storage = null;
      this.#media.textTracks.setStorage(null);
    });
  }
  #computeMediaId() {
    const { clipStartTime, clipEndTime } = this.$props, { source } = this.$state, src = source();
    return src.src ? `${src.src}:${clipStartTime()}:${clipEndTime()}` : null;
  }
  /**
   * Begins/resumes playback of the media. If this method is called programmatically before the
   * user has interacted with the player, the promise may be rejected subject to the browser's
   * autoplay policies. This method will throw if called before media is ready for playback.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play}
   */
  async play(trigger) {
    return this.#requestMgr.play(trigger);
  }
  /**
   * Pauses playback of the media. This method will throw if called before media is ready for
   * playback.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/pause}
   */
  async pause(trigger) {
    return this.#requestMgr.pause(trigger);
  }
  /**
   * Attempts to display the player in fullscreen. The promise will resolve if successful, and
   * reject if not. This method will throw if any fullscreen API is _not_ currently available.
   *
   * @see {@link https://vidstack.io/docs/player/api/fullscreen}
   */
  async enterFullscreen(target, trigger) {
    return this.#requestMgr.enterFullscreen(target, trigger);
  }
  /**
   * Attempts to display the player inline by exiting fullscreen. This method will throw if any
   * fullscreen API is _not_ currently available.
   *
   * @see {@link https://vidstack.io/docs/player/api/fullscreen}
   */
  async exitFullscreen(target, trigger) {
    return this.#requestMgr.exitFullscreen(target, trigger);
  }
  /**
   * Attempts to display the player in picture-in-picture mode. This method will throw if PIP is
   * not supported. This method will also return a `PictureInPictureWindow` if the current
   * provider supports it.
   *
   * @see {@link https://vidstack.io/docs/player/api/picture-in-picture}
   */
  enterPictureInPicture(trigger) {
    return this.#requestMgr.enterPictureInPicture(trigger);
  }
  /**
   * Attempts to display the player in inline by exiting picture-in-picture mode. This method
   * will throw if not supported.
   *
   * @see {@link https://vidstack.io/docs/player/api/picture-in-picture}
   */
  exitPictureInPicture(trigger) {
    return this.#requestMgr.exitPictureInPicture(trigger);
  }
  /**
   * Sets the current time to the live edge (i.e., `duration`). This is a no-op for non-live
   * streams and will throw if called before media is ready for playback.
   *
   * @see {@link https://vidstack.io/docs/player/api/live}
   */
  seekToLiveEdge(trigger) {
    this.#requestMgr.seekToLiveEdge(trigger);
  }
  /**
   * Called when media can begin loading. Calling this method will trigger the initial provider
   * loading process. Calling it more than once has no effect.
   *
   * @see {@link https://vidstack.io/docs/player/core-concepts/loading#load-strategies}
   */
  startLoading(trigger) {
    this.#media.notify("can-load", void 0, trigger);
  }
  /**
   * Called when the poster image can begin loading. Calling it more than once has no effect.
   *
   * @see {@link https://vidstack.io/docs/player/core-concepts/loading#load-strategies}
   */
  startLoadingPoster(trigger) {
    this.#media.notify("can-load-poster", void 0, trigger);
  }
  /**
   * Request Apple AirPlay picker to open.
   */
  requestAirPlay(trigger) {
    return this.#requestMgr.requestAirPlay(trigger);
  }
  /**
   * Request Google Cast device picker to open. The Google Cast framework will be loaded if it
   * hasn't yet.
   */
  requestGoogleCast(trigger) {
    return this.#requestMgr.requestGoogleCast(trigger);
  }
  /**
   * Set the audio gain, amplifying volume and enabling a maximum volume above 100%.
   *
   * @see {@link https://vidstack.io/docs/player/api/audio-gain}
   */
  setAudioGain(gain, trigger) {
    return this.#requestMgr.setAudioGain(gain, trigger);
  }
  destroy() {
    super.destroy();
    this.#media.remote.setPlayer(null);
    this.dispatch("destroy");
  }
}
const mediaplayer__proto = MediaPlayer.prototype;
prop(mediaplayer__proto, "canPlayQueue");
prop(mediaplayer__proto, "remoteControl");
prop(mediaplayer__proto, "provider");
prop(mediaplayer__proto, "controls");
prop(mediaplayer__proto, "orientation");
prop(mediaplayer__proto, "title");
prop(mediaplayer__proto, "qualities");
prop(mediaplayer__proto, "audioTracks");
prop(mediaplayer__proto, "textTracks");
prop(mediaplayer__proto, "textRenderers");
prop(mediaplayer__proto, "duration");
prop(mediaplayer__proto, "paused");
prop(mediaplayer__proto, "muted");
prop(mediaplayer__proto, "currentTime");
prop(mediaplayer__proto, "volume");
prop(mediaplayer__proto, "playbackRate");
method(mediaplayer__proto, "play");
method(mediaplayer__proto, "pause");
method(mediaplayer__proto, "enterFullscreen");
method(mediaplayer__proto, "exitFullscreen");
method(mediaplayer__proto, "enterPictureInPicture");
method(mediaplayer__proto, "exitPictureInPicture");
method(mediaplayer__proto, "seekToLiveEdge");
method(mediaplayer__proto, "startLoading");
method(mediaplayer__proto, "startLoadingPoster");
method(mediaplayer__proto, "requestAirPlay");
method(mediaplayer__proto, "requestGoogleCast");
method(mediaplayer__proto, "setAudioGain");

class MediaPlayerElement extends Host(HTMLElement, MediaPlayer) {
  static tagName = "media-player";
  static attrs = {
    autoPlay: "autoplay",
    crossOrigin: "crossorigin",
    playsInline: "playsinline",
    preferNativeHLS: "prefer-native-hls",
    minLiveDVRWindow: "min-live-dvr-window"
  };
}

class AudioProviderLoader {
  name = "audio";
  target;
  canPlay(src) {
    if (!isAudioSrc(src)) return false;
    return !isString(src.src) || src.type === "?" || canPlayAudioType(this.target, src.type);
  }
  mediaType() {
    return "audio";
  }
  async load(ctx) {
    if (!this.target) {
      throw Error(
        "[vidstack] `<audio>` element was not found - did you forget to include `<media-provider>`?"
      );
    }
    return new (await Promise.resolve().then(function () { return provider$4; })).AudioProvider(this.target, ctx);
  }
}

class VideoProviderLoader {
  name = "video";
  target;
  canPlay(src) {
    if (!isVideoSrc(src)) return false;
    return !isString(src.src) || src.type === "?" || canPlayVideoType(this.target, src.type);
  }
  mediaType() {
    return "video";
  }
  async load(ctx) {
    if (!this.target) {
      throw Error(
        "[vidstack] `<video>` element was not found - did you forget to include media provider?"
      );
    }
    return new (await Promise.resolve().then(function () { return provider$6; })).VideoProvider(this.target, ctx);
  }
}

let audioContext = null, gainNodes = [], elAudioSources = [];
function getOrCreateAudioCtx() {
  return audioContext ??= new AudioContext();
}
function createGainNode() {
  const audioCtx = getOrCreateAudioCtx(), gainNode = audioCtx.createGain();
  gainNode.connect(audioCtx.destination);
  gainNodes.push(gainNode);
  return gainNode;
}
function createElementSource(el, gainNode) {
  const audioCtx = getOrCreateAudioCtx(), src = audioCtx.createMediaElementSource(el);
  if (gainNode) {
    src.connect(gainNode);
  }
  elAudioSources.push(src);
  return src;
}
function destroyGainNode(node) {
  const idx = gainNodes.indexOf(node);
  if (idx !== -1) {
    gainNodes.splice(idx, 1);
    node.disconnect();
    freeAudioCtxWhenAllResourcesFreed();
  }
}
function destroyElementSource(src) {
  const idx = elAudioSources.indexOf(src);
  if (idx !== -1) {
    elAudioSources.splice(idx, 1);
    src.disconnect();
    freeAudioCtxWhenAllResourcesFreed();
  }
}
function freeAudioCtxWhenAllResourcesFreed() {
  if (audioContext && gainNodes.length === 0 && elAudioSources.length === 0) {
    audioContext.close().then(() => {
      audioContext = null;
    });
  }
}

class AudioGain {
  #media;
  #onChange;
  #gainNode = null;
  #srcAudioNode = null;
  get currentGain() {
    return this.#gainNode?.gain?.value ?? null;
  }
  get supported() {
    return true;
  }
  constructor(media, onChange) {
    this.#media = media;
    this.#onChange = onChange;
  }
  setGain(gain) {
    const currGain = this.currentGain;
    if (gain === this.currentGain) {
      return;
    }
    if (gain === 1 && currGain !== 1) {
      this.removeGain();
      return;
    }
    if (!this.#gainNode) {
      this.#gainNode = createGainNode();
      if (this.#srcAudioNode) {
        this.#srcAudioNode.connect(this.#gainNode);
      }
    }
    if (!this.#srcAudioNode) {
      this.#srcAudioNode = createElementSource(this.#media, this.#gainNode);
    }
    this.#gainNode.gain.value = gain;
    this.#onChange(gain);
  }
  removeGain() {
    if (!this.#gainNode) return;
    if (this.#srcAudioNode) {
      this.#srcAudioNode.connect(getOrCreateAudioCtx().destination);
    }
    this.#destroyGainNode();
    this.#onChange(null);
  }
  destroy() {
    this.#destroySrcNode();
    this.#destroyGainNode();
  }
  #destroySrcNode() {
    if (!this.#srcAudioNode) return;
    try {
      destroyElementSource(this.#srcAudioNode);
    } catch (e) {
    } finally {
      this.#srcAudioNode = null;
    }
  }
  #destroyGainNode() {
    if (!this.#gainNode) return;
    try {
      destroyGainNode(this.#gainNode);
    } catch (e) {
    } finally {
      this.#gainNode = null;
    }
  }
}

const PAGE_EVENTS = ["focus", "blur", "visibilitychange", "pageshow", "pagehide"];
class PageVisibility {
  #state = signal(determinePageState());
  #visibility = signal(document.visibilityState);
  #safariBeforeUnloadTimeout;
  connect() {
    const events = new EventsController(window), handlePageEvent = this.#handlePageEvent.bind(this);
    for (const eventType of PAGE_EVENTS) {
      events.add(eventType, handlePageEvent);
    }
    if (IS_SAFARI) {
      events.add("beforeunload", (event) => {
        this.#safariBeforeUnloadTimeout = setTimeout(() => {
          if (!(event.defaultPrevented || event.returnValue.length > 0)) {
            this.#state.set("hidden");
            this.#visibility.set("hidden");
          }
        }, 0);
      });
    }
  }
  /**
   * The current page state. Important to note we only account for a subset of page states, as
   * the rest aren't valuable to the player at the moment.
   *
   * - **active:** A page is in the active state if it is visible and has input focus.
   * - **passive:** A page is in the passive state if it is visible and does not have input focus.
   * - **hidden:** A page is in the hidden state if it is not visible.
   *
   * @see https://developers.google.com/web/updates/2018/07/page-lifecycle-api#states
   */
  get pageState() {
    return this.#state();
  }
  /**
   * The current document visibility state.
   *
   * - **visible:** The page content may be at least partially visible. In practice, this means that
   * the page is the foreground tab of a non-minimized window.
   * - **hidden:** The page content is not visible to the user. In practice this means that the
   * document is either a background tab or part of a minimized window, or the OS screen lock is
   * active.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilityState
   */
  get visibility() {
    return this.#visibility();
  }
  #handlePageEvent(event) {
    if (IS_SAFARI) window.clearTimeout(this.#safariBeforeUnloadTimeout);
    if (event.type !== "blur" || this.#state() === "active") {
      this.#state.set(determinePageState(event));
      this.#visibility.set(document.visibilityState == "hidden" ? "hidden" : "visible");
    }
  }
}
function determinePageState(event) {
  if (event?.type === "blur" || document.visibilityState === "hidden") return "hidden";
  if (document.hasFocus()) return "active";
  return "passive";
}

class RAFLoop {
  #id;
  #callback;
  constructor(callback) {
    this.#callback = callback;
  }
  start() {
    if (!isUndefined(this.#id)) return;
    this.#loop();
  }
  stop() {
    if (isNumber(this.#id)) window.cancelAnimationFrame(this.#id);
    this.#id = void 0;
  }
  #loop() {
    this.#id = window.requestAnimationFrame(() => {
      if (isUndefined(this.#id)) return;
      this.#callback();
      this.#loop();
    });
  }
}

class HTMLMediaEvents {
  #provider;
  #ctx;
  #waiting = false;
  #attachedLoadStart = false;
  #attachedCanPlay = false;
  #timeRAF = new RAFLoop(this.#onAnimationFrame.bind(this));
  #pageVisibility = new PageVisibility();
  #events;
  get #media() {
    return this.#provider.media;
  }
  constructor(provider, ctx) {
    this.#provider = provider;
    this.#ctx = ctx;
    this.#events = new EventsController(provider.media);
    this.#attachInitialListeners();
    this.#pageVisibility.connect();
    effect(this.#attachTimeUpdate.bind(this));
    onDispose(this.#onDispose.bind(this));
  }
  #onDispose() {
    this.#attachedLoadStart = false;
    this.#attachedCanPlay = false;
    this.#timeRAF.stop();
    this.#events.abort();
    this.#devHandlers?.clear();
  }
  /**
   * The `timeupdate` event fires surprisingly infrequently during playback, meaning your progress
   * bar (or whatever else is synced to the currentTime) moves in a choppy fashion. This helps
   * resolve that by retrieving time updates in a request animation frame loop.
   */
  #lastSeenTime = 0;
  #seekedTo = -1;
  #onAnimationFrame() {
    const newTime = this.#media.currentTime;
    const didStutter = IS_SAFARI && newTime - this.#seekedTo < 0.35;
    if (!didStutter && this.#lastSeenTime !== newTime) {
      this.#updateCurrentTime(newTime);
      this.#lastSeenTime = newTime;
    }
  }
  #attachInitialListeners() {
    {
      this.#ctx.logger?.info("attaching initial listeners");
    }
    this.#attachEventListener("loadstart", this.#onLoadStart);
    this.#attachEventListener("abort", this.#onAbort);
    this.#attachEventListener("emptied", this.#onEmptied);
    this.#attachEventListener("error", this.#onError);
    this.#attachEventListener("volumechange", this.#onVolumeChange);
    this.#ctx.logger?.debug("attached initial media event listeners");
  }
  #attachLoadStartListeners() {
    if (this.#attachedLoadStart) return;
    {
      this.#ctx.logger?.info("attaching load start listeners");
    }
    this.#attachEventListener("loadeddata", this.#onLoadedData);
    this.#attachEventListener("loadedmetadata", this.#onLoadedMetadata);
    this.#attachEventListener("canplay", this.#onCanPlay);
    this.#attachEventListener("canplaythrough", this.#onCanPlayThrough);
    this.#attachEventListener("durationchange", this.#onDurationChange);
    this.#attachEventListener("play", this.#onPlay);
    this.#attachEventListener("progress", this.#onProgress);
    this.#attachEventListener("stalled", this.#onStalled);
    this.#attachEventListener("suspend", this.#onSuspend);
    this.#attachEventListener("ratechange", this.#onRateChange);
    this.#attachedLoadStart = true;
  }
  #attachCanPlayListeners() {
    if (this.#attachedCanPlay) return;
    {
      this.#ctx.logger?.info("attaching can play listeners");
    }
    this.#attachEventListener("pause", this.#onPause);
    this.#attachEventListener("playing", this.#onPlaying);
    this.#attachEventListener("seeked", this.#onSeeked);
    this.#attachEventListener("seeking", this.#onSeeking);
    this.#attachEventListener("ended", this.#onEnded);
    this.#attachEventListener("waiting", this.#onWaiting);
    this.#attachedCanPlay = true;
  }
  #devHandlers = /* @__PURE__ */ new Map() ;
  #handleDevEvent = this.#onDevEvent.bind(this) ;
  #attachEventListener(eventType, handler) {
    this.#devHandlers.set(eventType, handler);
    this.#events.add(eventType, this.#handleDevEvent );
  }
  #onDevEvent(event2) {
    this.#ctx.logger?.debugGroup(`\u{1F4FA} provider fired \`${event2.type}\``).labelledLog("Provider", this.#provider).labelledLog("Event", event2).labelledLog("Media Store", { ...this.#ctx.$state }).dispatch();
    this.#devHandlers.get(event2.type)?.call(this, event2);
  }
  #updateCurrentTime(time, trigger) {
    const newTime = Math.min(time, this.#ctx.$state.seekableEnd());
    this.#ctx.notify("time-change", newTime, trigger);
  }
  #onLoadStart(event2) {
    if (this.#media.networkState === 3) {
      this.#onAbort(event2);
      return;
    }
    this.#attachLoadStartListeners();
    this.#ctx.notify("load-start", void 0, event2);
  }
  #onAbort(event2) {
    this.#ctx.notify("abort", void 0, event2);
  }
  #onEmptied() {
    this.#ctx.notify("emptied", void 0, event);
  }
  #onLoadedData(event2) {
    this.#ctx.notify("loaded-data", void 0, event2);
  }
  #onLoadedMetadata(event2) {
    this.#lastSeenTime = 0;
    this.#seekedTo = -1;
    this.#attachCanPlayListeners();
    this.#ctx.notify("loaded-metadata", void 0, event2);
    if (IS_IOS || IS_SAFARI && isHLSSrc(this.#ctx.$state.source())) {
      this.#ctx.delegate.ready(this.#getCanPlayDetail(), event2);
    }
  }
  #getCanPlayDetail() {
    return {
      provider: peek(this.#ctx.$provider),
      duration: this.#media.duration,
      buffered: this.#media.buffered,
      seekable: this.#media.seekable
    };
  }
  #onPlay(event2) {
    if (!this.#ctx.$state.canPlay) return;
    this.#ctx.notify("play", void 0, event2);
  }
  #onPause(event2) {
    if (this.#media.readyState === 1 && !this.#waiting) return;
    this.#waiting = false;
    this.#timeRAF.stop();
    this.#ctx.notify("pause", void 0, event2);
  }
  #onCanPlay(event2) {
    this.#ctx.delegate.ready(this.#getCanPlayDetail(), event2);
  }
  #onCanPlayThrough(event2) {
    if (this.#ctx.$state.started()) return;
    this.#ctx.notify("can-play-through", this.#getCanPlayDetail(), event2);
  }
  #onPlaying(event2) {
    if (this.#media.paused) return;
    this.#waiting = false;
    this.#ctx.notify("playing", void 0, event2);
    this.#timeRAF.start();
  }
  #onStalled(event2) {
    this.#ctx.notify("stalled", void 0, event2);
    if (this.#media.readyState < 3) {
      this.#waiting = true;
      this.#ctx.notify("waiting", void 0, event2);
    }
  }
  #onWaiting(event2) {
    if (this.#media.readyState < 3) {
      this.#waiting = true;
      this.#ctx.notify("waiting", void 0, event2);
    }
  }
  #onEnded(event2) {
    this.#timeRAF.stop();
    this.#updateCurrentTime(this.#media.duration, event2);
    this.#ctx.notify("end", void 0, event2);
    if (this.#ctx.$state.loop()) {
      const hasCustomControls = isNil(this.#media.controls);
      if (hasCustomControls) this.#media.controls = false;
    }
  }
  #attachTimeUpdate() {
    const isPaused = this.#ctx.$state.paused(), isPageHidden = this.#pageVisibility.visibility === "hidden", shouldListenToTimeUpdates = isPaused || isPageHidden;
    if (shouldListenToTimeUpdates) {
      listenEvent(this.#media, "timeupdate", this.#onTimeUpdate.bind(this));
    }
  }
  #onTimeUpdate(event2) {
    this.#updateCurrentTime(this.#media.currentTime, event2);
  }
  #onDurationChange(event2) {
    if (this.#ctx.$state.ended()) {
      this.#updateCurrentTime(this.#media.duration, event2);
    }
    this.#ctx.notify("duration-change", this.#media.duration, event2);
  }
  #onVolumeChange(event2) {
    const detail = {
      volume: this.#media.volume,
      muted: this.#media.muted
    };
    this.#ctx.notify("volume-change", detail, event2);
  }
  #onSeeked(event2) {
    this.#seekedTo = this.#media.currentTime;
    this.#updateCurrentTime(this.#media.currentTime, event2);
    this.#ctx.notify("seeked", this.#media.currentTime, event2);
    if (Math.trunc(this.#media.currentTime) === Math.trunc(this.#media.duration) && getNumberOfDecimalPlaces(this.#media.duration) > getNumberOfDecimalPlaces(this.#media.currentTime)) {
      this.#updateCurrentTime(this.#media.duration, event2);
      if (!this.#media.ended) {
        this.#ctx.player.dispatch(
          new DOMEvent("media-play-request", {
            trigger: event2
          })
        );
      }
    }
  }
  #onSeeking(event2) {
    this.#ctx.notify("seeking", this.#media.currentTime, event2);
  }
  #onProgress(event2) {
    const detail = {
      buffered: this.#media.buffered,
      seekable: this.#media.seekable
    };
    this.#ctx.notify("progress", detail, event2);
  }
  #onSuspend(event2) {
    this.#ctx.notify("suspend", void 0, event2);
  }
  #onRateChange(event2) {
    this.#ctx.notify("rate-change", this.#media.playbackRate, event2);
  }
  #onError(event2) {
    const error = this.#media.error;
    if (!error) return;
    const detail = {
      message: error.message,
      code: error.code,
      mediaError: error
    };
    this.#ctx.notify("error", detail, event2);
  }
}

class NativeAudioTracks {
  #provider;
  #ctx;
  get #nativeTracks() {
    return this.#provider.media.audioTracks;
  }
  constructor(provider, ctx) {
    this.#provider = provider;
    this.#ctx = ctx;
    this.#nativeTracks.onaddtrack = this.#onAddNativeTrack.bind(this);
    this.#nativeTracks.onremovetrack = this.#onRemoveNativeTrack.bind(this);
    this.#nativeTracks.onchange = this.#onChangeNativeTrack.bind(this);
    listenEvent(this.#ctx.audioTracks, "change", this.#onChangeTrack.bind(this));
  }
  #onAddNativeTrack(event) {
    const nativeTrack = event.track;
    if (nativeTrack.label === "") return;
    const id = nativeTrack.id.toString() || `native-audio-${this.#ctx.audioTracks.length}`, audioTrack = {
      id,
      label: nativeTrack.label,
      language: nativeTrack.language,
      kind: nativeTrack.kind,
      selected: false
    };
    this.#ctx.audioTracks[ListSymbol.add](audioTrack, event);
    if (nativeTrack.enabled) audioTrack.selected = true;
  }
  #onRemoveNativeTrack(event) {
    const track = this.#ctx.audioTracks.getById(event.track.id);
    if (track) this.#ctx.audioTracks[ListSymbol.remove](track, event);
  }
  #onChangeNativeTrack(event) {
    let enabledTrack = this.#getEnabledNativeTrack();
    if (!enabledTrack) return;
    const track = this.#ctx.audioTracks.getById(enabledTrack.id);
    if (track) this.#ctx.audioTracks[ListSymbol.select](track, true, event);
  }
  #getEnabledNativeTrack() {
    return Array.from(this.#nativeTracks).find((track) => track.enabled);
  }
  #onChangeTrack(event) {
    const { current } = event.detail;
    if (!current) return;
    const track = this.#nativeTracks.getTrackById(current.id);
    if (track) {
      const prev = this.#getEnabledNativeTrack();
      if (prev) prev.enabled = false;
      track.enabled = true;
    }
  }
}

class HTMLMediaProvider {
  constructor(media, ctx) {
    this.media = media;
    this.ctx = ctx;
    this.audioGain = new AudioGain(media, (gain) => {
      this.ctx.notify("audio-gain-change", gain);
    });
  }
  scope = createScope();
  currentSrc = null;
  audioGain;
  setup() {
    new HTMLMediaEvents(this, this.ctx);
    if ("audioTracks" in this.media) new NativeAudioTracks(this, this.ctx);
    onDispose(() => {
      this.audioGain.destroy();
      this.media.srcObject = null;
      this.media.removeAttribute("src");
      for (const source of this.media.querySelectorAll("source")) source.remove();
      this.media.load();
    });
  }
  get type() {
    return "";
  }
  setPlaybackRate(rate) {
    this.media.playbackRate = rate;
  }
  async play() {
    return this.media.play();
  }
  async pause() {
    return this.media.pause();
  }
  setMuted(muted) {
    this.media.muted = muted;
  }
  setVolume(volume) {
    this.media.volume = volume;
  }
  setCurrentTime(time) {
    this.media.currentTime = time;
  }
  setPlaysInline(inline) {
    setAttribute(this.media, "playsinline", inline);
  }
  async loadSource({ src, type }, preload) {
    this.media.preload = preload || "";
    if (isMediaStream(src)) {
      this.removeSource();
      this.media.srcObject = src;
    } else {
      this.media.srcObject = null;
      if (isString(src)) {
        if (type !== "?") {
          this.appendSource({ src, type });
        } else {
          this.removeSource();
          this.media.src = this.#appendMediaFragment(src);
        }
      } else {
        this.removeSource();
        this.media.src = window.URL.createObjectURL(src);
      }
    }
    this.media.load();
    this.currentSrc = { src, type };
  }
  /**
   * Append source so it works when requesting AirPlay since hls.js will remove it.
   */
  appendSource(src, defaultType) {
    const prevSource = this.media.querySelector("source[data-vds]"), source = prevSource ?? document.createElement("source");
    setAttribute(source, "src", this.#appendMediaFragment(src.src));
    setAttribute(source, "type", src.type !== "?" ? src.type : defaultType);
    setAttribute(source, "data-vds", "");
    if (!prevSource) this.media.append(source);
  }
  removeSource() {
    this.media.querySelector("source[data-vds]")?.remove();
  }
  #appendMediaFragment(src) {
    const { clipStartTime, clipEndTime } = this.ctx.$state, startTime = clipStartTime(), endTime = clipEndTime();
    if (startTime > 0 && endTime > 0) {
      return `${src}#t=${startTime},${endTime}`;
    } else if (startTime > 0) {
      return `${src}#t=${startTime}`;
    } else if (endTime > 0) {
      return `${src}#t=0,${endTime}`;
    }
    return src;
  }
}

class HTMLRemotePlaybackAdapter {
  #media;
  #ctx;
  #state;
  #supported = signal(false);
  get supported() {
    return this.#supported();
  }
  constructor(media, ctx) {
    this.#media = media;
    this.#ctx = ctx;
    this.#setup();
  }
  #setup() {
    if (!this.#media?.remote || !this.canPrompt) return;
    this.#media.remote.watchAvailability((available) => {
      this.#supported.set(available);
    }).catch(() => {
      this.#supported.set(false);
    });
    effect(this.#watchSupported.bind(this));
  }
  #watchSupported() {
    if (!this.#supported()) return;
    const events = ["connecting", "connect", "disconnect"], onStateChange = this.#onStateChange.bind(this);
    onStateChange();
    listenEvent(this.#media, "playing", onStateChange);
    const remoteEvents = new EventsController(this.#media.remote);
    for (const type of events) {
      remoteEvents.add(type, onStateChange);
    }
  }
  async prompt() {
    if (!this.supported) throw Error("Not supported on this platform.");
    if (this.type === "airplay" && this.#media.webkitShowPlaybackTargetPicker) {
      return this.#media.webkitShowPlaybackTargetPicker();
    }
    return this.#media.remote.prompt();
  }
  #onStateChange(event) {
    const state = this.#media.remote.state;
    if (state === this.#state) return;
    const detail = { type: this.type, state };
    this.#ctx.notify("remote-playback-change", detail, event);
    this.#state = state;
  }
}
class HTMLAirPlayAdapter extends HTMLRemotePlaybackAdapter {
  type = "airplay";
  get canPrompt() {
    return "WebKitPlaybackTargetAvailabilityEvent" in window;
  }
}

class NativeHLSTextTracks {
  #video;
  #ctx;
  constructor(video, ctx) {
    this.#video = video;
    this.#ctx = ctx;
    video.textTracks.onaddtrack = this.#onAddTrack.bind(this);
    onDispose(this.#onDispose.bind(this));
  }
  #onAddTrack(event) {
    const nativeTrack = event.track;
    if (!nativeTrack || findTextTrackElement(this.#video, nativeTrack)) return;
    const track = new TextTrack({
      id: nativeTrack.id,
      kind: nativeTrack.kind,
      label: nativeTrack.label ?? "",
      language: nativeTrack.language,
      type: "vtt"
    });
    track[TextTrackSymbol.native] = { track: nativeTrack };
    track[TextTrackSymbol.readyState] = 2;
    track[TextTrackSymbol.nativeHLS] = true;
    let lastIndex = 0;
    const onCueChange = (event2) => {
      if (!nativeTrack.cues) return;
      for (let i = lastIndex; i < nativeTrack.cues.length; i++) {
        track.addCue(nativeTrack.cues[i], event2);
        lastIndex++;
      }
    };
    onCueChange(event);
    nativeTrack.oncuechange = onCueChange;
    this.#ctx.textTracks.add(track, event);
    track.setMode(nativeTrack.mode, event);
  }
  #onDispose() {
    this.#video.textTracks.onaddtrack = null;
    for (const track of this.#ctx.textTracks) {
      const nativeTrack = track[TextTrackSymbol.native]?.track;
      if (nativeTrack?.oncuechange) nativeTrack.oncuechange = null;
    }
  }
}
function findTextTrackElement(video, track) {
  return Array.from(video.children).find((el) => el.track === track);
}

class VideoPictureInPicture {
  #video;
  #media;
  constructor(video, media) {
    this.#video = video;
    this.#media = media;
    new EventsController(video).add("enterpictureinpicture", this.#onEnter.bind(this)).add("leavepictureinpicture", this.#onExit.bind(this));
  }
  get active() {
    return document.pictureInPictureElement === this.#video;
  }
  get supported() {
    return canUsePictureInPicture(this.#video);
  }
  async enter() {
    return this.#video.requestPictureInPicture();
  }
  exit() {
    return document.exitPictureInPicture();
  }
  #onEnter(event) {
    this.#onChange(true, event);
  }
  #onExit(event) {
    this.#onChange(false, event);
  }
  #onChange = (active, event) => {
    this.#media.notify("picture-in-picture-change", active, event);
  };
}

class VideoPresentation {
  #video;
  #media;
  #mode = "inline";
  get mode() {
    return this.#mode;
  }
  constructor(video, media) {
    this.#video = video;
    this.#media = media;
    listenEvent(video, "webkitpresentationmodechanged", this.#onModeChange.bind(this));
  }
  get supported() {
    return canUseVideoPresentation(this.#video);
  }
  async setPresentationMode(mode) {
    if (this.#mode === mode) return;
    this.#video.webkitSetPresentationMode(mode);
  }
  #onModeChange(event) {
    const prevMode = this.#mode;
    this.#mode = this.#video.webkitPresentationMode;
    {
      this.#media.logger?.infoGroup("presentation mode change").labelledLog("Mode", this.#mode).labelledLog("Event", event).dispatch();
    }
    this.#media.player?.dispatch(
      new DOMEvent("video-presentation-change", {
        detail: this.#mode,
        trigger: event
      })
    );
    ["fullscreen", "picture-in-picture"].forEach((type) => {
      if (this.#mode === type || prevMode === type) {
        this.#media.notify(`${type}-change`, this.#mode === type, event);
      }
    });
  }
}
class FullscreenPresentationAdapter {
  #presentation;
  get active() {
    return this.#presentation.mode === "fullscreen";
  }
  get supported() {
    return this.#presentation.supported;
  }
  constructor(presentation) {
    this.#presentation = presentation;
  }
  async enter() {
    this.#presentation.setPresentationMode("fullscreen");
  }
  async exit() {
    this.#presentation.setPresentationMode("inline");
  }
}
class PIPPresentationAdapter {
  #presentation;
  get active() {
    return this.#presentation.mode === "picture-in-picture";
  }
  get supported() {
    return this.#presentation.supported;
  }
  constructor(presentation) {
    this.#presentation = presentation;
  }
  async enter() {
    this.#presentation.setPresentationMode("picture-in-picture");
  }
  async exit() {
    this.#presentation.setPresentationMode("inline");
  }
}

class VideoProvider extends HTMLMediaProvider {
  $$PROVIDER_TYPE = "VIDEO";
  get type() {
    return "video";
  }
  airPlay;
  fullscreen;
  pictureInPicture;
  constructor(video, ctx) {
    super(video, ctx);
    scoped(() => {
      this.airPlay = new HTMLAirPlayAdapter(video, ctx);
      if (canUseVideoPresentation(video)) {
        const presentation = new VideoPresentation(video, ctx);
        this.fullscreen = new FullscreenPresentationAdapter(presentation);
        this.pictureInPicture = new PIPPresentationAdapter(presentation);
      } else if (canUsePictureInPicture(video)) {
        this.pictureInPicture = new VideoPictureInPicture(video, ctx);
      }
    }, this.scope);
  }
  setup() {
    super.setup();
    if (canPlayHLSNatively(this.video)) {
      new NativeHLSTextTracks(this.video, this.ctx);
    }
    this.ctx.textRenderers.attachVideo(this.video);
    onDispose(() => {
      this.ctx.textRenderers.attachVideo(null);
    });
    if (this.type === "video") this.ctx.notify("provider-setup", this);
  }
  /**
   * The native HTML `<video>` element.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement}
   */
  get video() {
    return this.media;
  }
}

var provider$6 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  VideoProvider: VideoProvider
});

function getLangName(langCode) {
  try {
    const displayNames = new Intl.DisplayNames(navigator.languages, { type: "language" });
    const languageName = displayNames.of(langCode);
    return languageName ?? null;
  } catch (err) {
    return null;
  }
}

const toDOMEventType$1 = (type) => `dash-${camelToKebabCase(type)}`;
class DASHController {
  #video;
  #ctx;
  #instance = null;
  #callbacks = /* @__PURE__ */ new Set();
  #stopLiveSync = null;
  config = {};
  get instance() {
    return this.#instance;
  }
  constructor(video, ctx) {
    this.#video = video;
    this.#ctx = ctx;
  }
  setup(ctor) {
    this.#instance = ctor().create();
    const dispatcher = this.#dispatchDASHEvent.bind(this);
    for (const event of Object.values(ctor.events)) this.#instance.on(event, dispatcher);
    this.#instance.on(ctor.events.ERROR, this.#onError.bind(this));
    for (const callback of this.#callbacks) callback(this.#instance);
    this.#ctx.player.dispatch("dash-instance", {
      detail: this.#instance
    });
    this.#instance.initialize(this.#video, void 0, false);
    this.#instance.updateSettings({
      streaming: {
        text: {
          // Disabling text rendering by dash.
          defaultEnabled: false,
          dispatchForManualRendering: true
        },
        buffer: {
          /// Enables buffer replacement when switching bitrates for faster switching.
          fastSwitchEnabled: true
        }
      },
      ...this.config
    });
    this.#instance.on(ctor.events.FRAGMENT_LOADING_STARTED, this.#onFragmentLoadStart.bind(this));
    this.#instance.on(
      ctor.events.FRAGMENT_LOADING_COMPLETED,
      this.#onFragmentLoadComplete.bind(this)
    );
    this.#instance.on(ctor.events.MANIFEST_LOADED, this.#onManifestLoaded.bind(this));
    this.#instance.on(ctor.events.QUALITY_CHANGE_RENDERED, this.#onQualityChange.bind(this));
    this.#instance.on(ctor.events.TEXT_TRACKS_ADDED, this.#onTextTracksAdded.bind(this));
    this.#instance.on(ctor.events.TRACK_CHANGE_RENDERED, this.#onTrackChange.bind(this));
    this.#ctx.qualities[QualitySymbol.enableAuto] = this.#enableAutoQuality.bind(this);
    listenEvent(this.#ctx.qualities, "change", this.#onUserQualityChange.bind(this));
    listenEvent(this.#ctx.audioTracks, "change", this.#onUserAudioChange.bind(this));
    this.#stopLiveSync = effect(this.#liveSync.bind(this));
  }
  #createDOMEvent(event) {
    return new DOMEvent(toDOMEventType$1(event.type), { detail: event });
  }
  #liveSync() {
    if (!this.#ctx.$state.live()) return;
    const raf = new RAFLoop(this.#liveSyncPosition.bind(this));
    raf.start();
    return raf.stop.bind(raf);
  }
  #liveSyncPosition() {
    if (!this.#instance) return;
    const position = this.#instance.duration() - this.#instance.time();
    this.#ctx.$state.liveSyncPosition.set(!isNaN(position) ? position : Infinity);
  }
  #dispatchDASHEvent(event) {
    this.#ctx.player?.dispatch(this.#createDOMEvent(event));
  }
  #currentTrack = null;
  #cueTracker = {};
  #onTextFragmentLoaded(event) {
    const native = this.#currentTrack?.[TextTrackSymbol.native], cues = (native?.track).cues;
    if (!native || !cues) return;
    const id = this.#currentTrack.id, startIndex = this.#cueTracker[id] ?? 0, trigger = this.#createDOMEvent(event);
    for (let i = startIndex; i < cues.length; i++) {
      const cue = cues[i];
      if (!cue.positionAlign) cue.positionAlign = "auto";
      this.#currentTrack.addCue(cue, trigger);
    }
    this.#cueTracker[id] = cues.length;
  }
  #onTextTracksAdded(event) {
    if (!this.#instance) return;
    const data = event.tracks, nativeTextTracks = [...this.#video.textTracks].filter((track) => "manualMode" in track), trigger = this.#createDOMEvent(event);
    for (let i = 0; i < nativeTextTracks.length; i++) {
      const textTrackInfo = data[i], nativeTextTrack = nativeTextTracks[i];
      const id = `dash-${textTrackInfo.kind}-${i}`, track = new TextTrack({
        id,
        label: textTrackInfo?.label ?? textTrackInfo.labels.find((t) => t.text)?.text ?? (textTrackInfo?.lang && getLangName(textTrackInfo.lang)) ?? textTrackInfo?.lang ?? void 0,
        language: textTrackInfo.lang ?? void 0,
        kind: textTrackInfo.kind,
        default: textTrackInfo.defaultTrack
      });
      track[TextTrackSymbol.native] = {
        managed: true,
        track: nativeTextTrack
      };
      track[TextTrackSymbol.readyState] = 2;
      track[TextTrackSymbol.onModeChange] = () => {
        if (!this.#instance) return;
        if (track.mode === "showing") {
          this.#instance.setTextTrack(i);
          this.#currentTrack = track;
        } else {
          this.#instance.setTextTrack(-1);
          this.#currentTrack = null;
        }
      };
      this.#ctx.textTracks.add(track, trigger);
    }
  }
  #onTrackChange(event) {
    const { mediaType, newMediaInfo } = event;
    if (mediaType === "audio") {
      const track = this.#ctx.audioTracks.getById(`dash-audio-${newMediaInfo.index}`);
      if (track) {
        const trigger = this.#createDOMEvent(event);
        this.#ctx.audioTracks[ListSymbol.select](track, true, trigger);
      }
    }
  }
  #onQualityChange(event) {
    if (event.mediaType !== "video") return;
    const quality = this.#ctx.qualities[event.newQuality];
    if (quality) {
      const trigger = this.#createDOMEvent(event);
      this.#ctx.qualities[ListSymbol.select](quality, true, trigger);
    }
  }
  #onManifestLoaded(event) {
    if (this.#ctx.$state.canPlay() || !this.#instance) return;
    const { type, mediaPresentationDuration } = event.data, trigger = this.#createDOMEvent(event);
    this.#ctx.notify("stream-type-change", type !== "static" ? "live" : "on-demand", trigger);
    this.#ctx.notify("duration-change", mediaPresentationDuration, trigger);
    this.#ctx.qualities[QualitySymbol.setAuto](true, trigger);
    const media = this.#instance.getVideoElement();
    const videoQualities = this.#instance.getTracksForTypeFromManifest(
      "video",
      event.data
    );
    const supportedVideoMimeType = [...new Set(videoQualities.map((e) => e.mimeType))].find(
      (type2) => type2 && canPlayVideoType(media, type2)
    );
    const videoQuality = videoQualities.filter(
      (track) => supportedVideoMimeType === track.mimeType
    )[0];
    let audioTracks = this.#instance.getTracksForTypeFromManifest(
      "audio",
      event.data
    );
    const supportedAudioMimeType = [...new Set(audioTracks.map((e) => e.mimeType))].find(
      (type2) => type2 && canPlayAudioType(media, type2)
    );
    audioTracks = audioTracks.filter((track) => supportedAudioMimeType === track.mimeType);
    videoQuality.bitrateList.forEach((bitrate, index) => {
      const quality = {
        id: bitrate.id?.toString() ?? `dash-bitrate-${index}`,
        width: bitrate.width ?? 0,
        height: bitrate.height ?? 0,
        bitrate: bitrate.bandwidth ?? 0,
        codec: videoQuality.codec,
        index
      };
      this.#ctx.qualities[ListSymbol.add](quality, trigger);
    });
    if (isNumber(videoQuality.index)) {
      const quality = this.#ctx.qualities[videoQuality.index];
      if (quality) this.#ctx.qualities[ListSymbol.select](quality, true, trigger);
    }
    audioTracks.forEach((audioTrack, index) => {
      const matchingLabel = audioTrack.labels.find((label2) => {
        return navigator.languages.some((language) => {
          return label2.lang && language.toLowerCase().startsWith(label2.lang.toLowerCase());
        });
      });
      const label = matchingLabel || audioTrack.labels[0];
      const localTrack = {
        id: `dash-audio-${audioTrack?.index}`,
        label: label?.text ?? (audioTrack.lang && getLangName(audioTrack.lang)) ?? audioTrack.lang ?? "",
        language: audioTrack.lang ?? "",
        kind: "main",
        mimeType: audioTrack.mimeType,
        codec: audioTrack.codec,
        index
      };
      this.#ctx.audioTracks[ListSymbol.add](localTrack, trigger);
    });
    media.dispatchEvent(new DOMEvent("canplay", { trigger }));
  }
  #onError(event) {
    const { type: eventType, error: data } = event;
    {
      this.#ctx.logger?.errorGroup(`[vidstack] DASH error \`${data.message}\``).labelledLog("Media Element", this.#video).labelledLog("DASH Instance", this.#instance).labelledLog("Event Type", eventType).labelledLog("Data", data).labelledLog("Src", peek(this.#ctx.$state.source)).labelledLog("Media Store", { ...this.#ctx.$state }).dispatch();
    }
    switch (data.code) {
      case 27:
        this.#onNetworkError(data);
        break;
      default:
        this.#onFatalError(data);
        break;
    }
  }
  #onFragmentLoadStart() {
    if (this.#retryLoadingTimer >= 0) this.#clearRetryTimer();
  }
  #onFragmentLoadComplete(event) {
    const mediaType = event.mediaType;
    if (mediaType === "text") {
      requestAnimationFrame(this.#onTextFragmentLoaded.bind(this, event));
    }
  }
  #retryLoadingTimer = -1;
  #onNetworkError(error) {
    this.#clearRetryTimer();
    this.#instance?.play();
    this.#retryLoadingTimer = window.setTimeout(() => {
      this.#retryLoadingTimer = -1;
      this.#onFatalError(error);
    }, 5e3);
  }
  #clearRetryTimer() {
    clearTimeout(this.#retryLoadingTimer);
    this.#retryLoadingTimer = -1;
  }
  #onFatalError(error) {
    this.#ctx.notify("error", {
      message: error.message ?? "",
      code: 1,
      error
    });
  }
  #enableAutoQuality() {
    this.#switchAutoBitrate("video", true);
    const { qualities } = this.#ctx;
    this.#instance?.setQualityFor("video", qualities.selectedIndex, true);
  }
  #switchAutoBitrate(type, auto) {
    this.#instance?.updateSettings({
      streaming: { abr: { autoSwitchBitrate: { [type]: auto } } }
    });
  }
  #onUserQualityChange() {
    const { qualities } = this.#ctx;
    if (!this.#instance || qualities.auto || !qualities.selected) return;
    this.#switchAutoBitrate("video", false);
    this.#instance.setQualityFor("video", qualities.selectedIndex, qualities.switch === "current");
    if (IS_CHROME) {
      this.#video.currentTime = this.#video.currentTime;
    }
  }
  #onUserAudioChange() {
    if (!this.#instance) return;
    const { audioTracks } = this.#ctx, selectedTrack = this.#instance.getTracksFor("audio").find(
      (track) => audioTracks.selected && audioTracks.selected.id === `dash-audio-${track.index}`
    );
    if (selectedTrack) this.#instance.setCurrentTrack(selectedTrack);
  }
  #reset() {
    this.#clearRetryTimer();
    this.#currentTrack = null;
    this.#cueTracker = {};
  }
  onInstance(callback) {
    this.#callbacks.add(callback);
    return () => this.#callbacks.delete(callback);
  }
  loadSource(src) {
    this.#reset();
    if (!isString(src.src)) return;
    this.#instance?.attachSource(src.src);
  }
  destroy() {
    this.#reset();
    this.#instance?.destroy();
    this.#instance = null;
    this.#stopLiveSync?.();
    this.#stopLiveSync = null;
    this.#ctx?.logger?.info("\u{1F3D7}\uFE0F Destroyed DASH instance");
  }
}

class DASHLibLoader {
  #lib;
  #ctx;
  #callback;
  constructor(lib, ctx, callback) {
    this.#lib = lib;
    this.#ctx = ctx;
    this.#callback = callback;
    this.#startLoading();
  }
  async #startLoading() {
    this.#ctx.logger?.info("\u{1F3D7}\uFE0F Loading DASH Library");
    const callbacks = {
      onLoadStart: this.#onLoadStart.bind(this),
      onLoaded: this.#onLoaded.bind(this),
      onLoadError: this.#onLoadError.bind(this)
    };
    let ctor = await loadDASHScript(this.#lib, callbacks);
    if (isUndefined(ctor) && !isString(this.#lib)) ctor = await importDASH(this.#lib, callbacks);
    if (!ctor) return null;
    if (!window.dashjs.supportsMediaSource()) {
      const message = "[vidstack] `dash.js` is not supported in this environment";
      this.#ctx.logger?.error(message);
      this.#ctx.player.dispatch(new DOMEvent("dash-unsupported"));
      this.#ctx.notify("error", { message, code: 4 });
      return null;
    }
    return ctor;
  }
  #onLoadStart() {
    {
      this.#ctx.logger?.infoGroup("Starting to load `dash.js`").labelledLog("URL", this.#lib).dispatch();
    }
    this.#ctx.player.dispatch(new DOMEvent("dash-lib-load-start"));
  }
  #onLoaded(ctor) {
    {
      this.#ctx.logger?.infoGroup("Loaded `dash.js`").labelledLog("Library", this.#lib).labelledLog("Constructor", ctor).dispatch();
    }
    this.#ctx.player.dispatch(
      new DOMEvent("dash-lib-loaded", {
        detail: ctor
      })
    );
    this.#callback(ctor);
  }
  #onLoadError(e) {
    const error = coerceToError(e);
    {
      this.#ctx.logger?.errorGroup("[vidstack] Failed to load `dash.js`").labelledLog("Library", this.#lib).labelledLog("Error", e).dispatch();
    }
    this.#ctx.player.dispatch(
      new DOMEvent("dash-lib-load-error", {
        detail: error
      })
    );
    this.#ctx.notify("error", {
      message: error.message,
      code: 4,
      error
    });
  }
}
async function importDASH(loader, callbacks = {}) {
  if (isUndefined(loader)) return void 0;
  callbacks.onLoadStart?.();
  if (isDASHConstructor(loader)) {
    callbacks.onLoaded?.(loader);
    return loader;
  }
  if (isDASHNamespace(loader)) {
    const ctor = loader.MediaPlayer;
    callbacks.onLoaded?.(ctor);
    return ctor;
  }
  try {
    const ctor = (await loader())?.default;
    if (isDASHNamespace(ctor)) {
      callbacks.onLoaded?.(ctor.MediaPlayer);
      return ctor.MediaPlayer;
    }
    if (ctor) {
      callbacks.onLoaded?.(ctor);
    } else {
      throw Error(
        true ? "[vidstack] failed importing `dash.js`. Dynamic import returned invalid object." : ""
      );
    }
    return ctor;
  } catch (err) {
    callbacks.onLoadError?.(err);
  }
  return void 0;
}
async function loadDASHScript(src, callbacks = {}) {
  if (!isString(src)) return void 0;
  callbacks.onLoadStart?.();
  try {
    await loadScript(src);
    if (!isFunction(window.dashjs.MediaPlayer)) {
      throw Error(
        true ? "[vidstack] failed loading `dash.js`. Could not find a valid `Dash` constructor on window" : ""
      );
    }
    const ctor = window.dashjs.MediaPlayer;
    callbacks.onLoaded?.(ctor);
    return ctor;
  } catch (err) {
    callbacks.onLoadError?.(err);
  }
  return void 0;
}
function isDASHConstructor(value) {
  return value && value.prototype && value.prototype !== Function;
}
function isDASHNamespace(value) {
  return value && "MediaPlayer" in value;
}

const JS_DELIVR_CDN$1 = "https://cdn.jsdelivr.net";
class DASHProvider extends VideoProvider {
  $$PROVIDER_TYPE = "DASH";
  #ctor = null;
  #controller = new DASHController(this.video, this.ctx);
  /**
   * The `dash.js` constructor.
   */
  get ctor() {
    return this.#ctor;
  }
  /**
   * The current `dash.js` instance.
   */
  get instance() {
    return this.#controller.instance;
  }
  /**
   * Whether `dash.js` is supported in this environment.
   */
  static supported = isDASHSupported();
  get type() {
    return "dash";
  }
  get canLiveSync() {
    return true;
  }
  #library = `${JS_DELIVR_CDN$1}/npm/dashjs@4.7.4/dist/dash${".all.debug.js" }`;
  /**
   * The `dash.js` configuration object.
   *
   * @see {@link https://cdn.dashjs.org/latest/jsdoc/module-Settings.html}
   */
  get config() {
    return this.#controller.config;
  }
  set config(config) {
    this.#controller.config = config;
  }
  /**
   * The `dash.js` constructor (supports dynamic imports) or a URL of where it can be found.
   *
   * @defaultValue `https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js`
   */
  get library() {
    return this.#library;
  }
  set library(library) {
    this.#library = library;
  }
  preconnect() {
    if (!isString(this.#library)) return;
    preconnect(this.#library);
  }
  setup() {
    super.setup();
    new DASHLibLoader(this.#library, this.ctx, (ctor) => {
      this.#ctor = ctor;
      this.#controller.setup(ctor);
      this.ctx.notify("provider-setup", this);
      const src = peek(this.ctx.$state.source);
      if (src) this.loadSource(src);
    });
  }
  async loadSource(src, preload) {
    if (!isString(src.src)) {
      this.removeSource();
      return;
    }
    this.media.preload = preload || "";
    this.appendSource(src, "application/x-mpegurl");
    this.#controller.loadSource(src);
    this.currentSrc = src;
  }
  /**
   * The given callback is invoked when a new `dash.js` instance is created and right before it's
   * attached to media.
   */
  onInstance(callback) {
    const instance = this.#controller.instance;
    if (instance) callback(instance);
    return this.#controller.onInstance(callback);
  }
  destroy() {
    this.#controller.destroy();
  }
}

var provider$5 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  DASHProvider: DASHProvider
});

class DASHProviderLoader extends VideoProviderLoader {
  static supported = isDASHSupported();
  name = "dash";
  canPlay(src) {
    return DASHProviderLoader.supported && isDASHSrc(src);
  }
  async load(context) {
    if (!this.target) {
      throw Error(
        "[vidstack] `<video>` element was not found - did you forget to include `<media-provider>`?"
      );
    }
    return new (await Promise.resolve().then(function () { return provider$5; })).DASHProvider(this.target, context);
  }
}

class HLSProviderLoader extends VideoProviderLoader {
  static supported = isHLSSupported();
  name = "hls";
  canPlay(src) {
    return HLSProviderLoader.supported && isHLSSrc(src);
  }
  async load(context) {
    if (!this.target) {
      throw Error(
        "[vidstack] `<video>` element was not found - did you forget to include `<media-provider>`?"
      );
    }
    return new (await Promise.resolve().then(function () { return provider$3; })).HLSProvider(this.target, context);
  }
}

class VimeoProviderLoader {
  name = "vimeo";
  target;
  preconnect() {
    const connections = [
      "https://i.vimeocdn.com",
      "https://f.vimeocdn.com",
      "https://fresnel.vimeocdn.com"
    ];
    for (const url of connections) {
      preconnect(url);
    }
  }
  canPlay(src) {
    return isString(src.src) && src.type === "video/vimeo";
  }
  mediaType() {
    return "video";
  }
  async load(ctx) {
    if (!this.target) {
      throw Error(
        "[vidstack] `<iframe>` element was not found - did you forget to include media provider?"
      );
    }
    return new (await Promise.resolve().then(function () { return provider$2; })).VimeoProvider(this.target, ctx);
  }
  async loadPoster(src, ctx, abort) {
    const { resolveVimeoVideoId, getVimeoVideoInfo } = await Promise.resolve().then(function () { return utils$1; });
    if (!isString(src.src)) return null;
    const { videoId, hash } = resolveVimeoVideoId(src.src);
    if (videoId) {
      return getVimeoVideoInfo(videoId, abort, hash).then((info) => info ? info.poster : null);
    }
    return null;
  }
}

class YouTubeProviderLoader {
  name = "youtube";
  target;
  preconnect() {
    const connections = [
      // Botguard script.
      "https://www.google.com",
      // Posters.
      "https://i.ytimg.com",
      // Ads.
      "https://googleads.g.doubleclick.net",
      "https://static.doubleclick.net"
    ];
    for (const url of connections) {
      preconnect(url);
    }
  }
  canPlay(src) {
    return isString(src.src) && src.type === "video/youtube";
  }
  mediaType() {
    return "video";
  }
  async load(ctx) {
    if (!this.target) {
      throw Error(
        "[vidstack] `<iframe>` element was not found - did you forget to include media provider?"
      );
    }
    return new (await Promise.resolve().then(function () { return provider$1; })).YouTubeProvider(this.target, ctx);
  }
  async loadPoster(src, ctx, abort) {
    const { findYouTubePoster, resolveYouTubeVideoId } = await Promise.resolve().then(function () { return utils; });
    const videoId = isString(src.src) && resolveYouTubeVideoId(src.src);
    if (videoId) return findYouTubePoster(videoId, abort);
    return null;
  }
}

function resolveStreamTypeFromDASHManifest(manifestSrc, requestInit) {
  return fetch(manifestSrc, requestInit).then((res) => res.text()).then((manifest) => {
    return /type="static"/.test(manifest) ? "on-demand" : "live";
  });
}
function resolveStreamTypeFromHLSManifest(manifestSrc, requestInit) {
  return fetch(manifestSrc, requestInit).then((res) => res.text()).then((manifest) => {
    const renditionURI = resolveHLSRenditionURI(manifest);
    if (renditionURI) {
      return resolveStreamTypeFromHLSManifest(
        /^https?:/.test(renditionURI) ? renditionURI : new URL(renditionURI, manifestSrc).href,
        requestInit
      );
    }
    const streamType = /EXT-X-PLAYLIST-TYPE:\s*VOD/.test(manifest) ? "on-demand" : "live";
    if (streamType === "live" && resolveTargetDuration(manifest) >= 10 && (/#EXT-X-DVR-ENABLED:\s*true/.test(manifest) || manifest.includes("#EXT-X-DISCONTINUITY"))) {
      return "live:dvr";
    }
    return streamType;
  });
}
function resolveHLSRenditionURI(manifest) {
  const matches = manifest.match(/#EXT-X-STREAM-INF:[^\n]+(\n[^\n]+)*/g);
  return matches ? matches[0].split("\n")[1].trim() : null;
}
function resolveTargetDuration(manifest) {
  const lines = manifest.split("\n");
  for (const line of lines) {
    if (line.startsWith("#EXT-X-TARGETDURATION")) {
      const duration = parseFloat(line.split(":")[1]);
      if (!isNaN(duration)) {
        return duration;
      }
    }
  }
  return -1;
}

let warned$1 = /* @__PURE__ */ new Set() ;
const sourceTypes = /* @__PURE__ */ new Map();
class SourceSelection {
  #initialize = false;
  #loaders;
  #domSources;
  #media;
  #loader;
  constructor(domSources, media, loader, customLoaders = []) {
    this.#domSources = domSources;
    this.#media = media;
    this.#loader = loader;
    const DASH_LOADER = new DASHProviderLoader(), HLS_LOADER = new HLSProviderLoader(), VIDEO_LOADER = new VideoProviderLoader(), AUDIO_LOADER = new AudioProviderLoader(), YOUTUBE_LOADER = new YouTubeProviderLoader(), VIMEO_LOADER = new VimeoProviderLoader(), EMBED_LOADERS = [YOUTUBE_LOADER, VIMEO_LOADER];
    this.#loaders = computed(() => {
      const remoteLoader = media.$state.remotePlaybackLoader();
      const loaders = media.$props.preferNativeHLS() ? [VIDEO_LOADER, AUDIO_LOADER, DASH_LOADER, HLS_LOADER, ...EMBED_LOADERS, ...customLoaders] : [HLS_LOADER, VIDEO_LOADER, AUDIO_LOADER, DASH_LOADER, ...EMBED_LOADERS, ...customLoaders];
      return remoteLoader ? [remoteLoader, ...loaders] : loaders;
    });
    const { $state } = media;
    $state.sources.set(normalizeSrc(media.$props.src()));
    for (const src of $state.sources()) {
      const loader2 = this.#loaders().find((loader3) => loader3.canPlay(src));
      if (!loader2) continue;
      const mediaType = loader2.mediaType(src);
      media.$state.source.set(src);
      media.$state.mediaType.set(mediaType);
      media.$state.inferredViewType.set(mediaType);
      this.#loader.set(loader2);
      this.#initialize = true;
      break;
    }
  }
  connect() {
    const loader = this.#loader();
    if (this.#initialize) {
      this.#notifySourceChange(this.#media.$state.source(), loader);
      this.#notifyLoaderChange(loader);
      this.#initialize = false;
    }
    effect(this.#onSourcesChange.bind(this));
    effect(this.#onSourceChange.bind(this));
    effect(this.#onSetup.bind(this));
    effect(this.#onLoadSource.bind(this));
    effect(this.#onLoadPoster.bind(this));
  }
  #onSourcesChange() {
    this.#media.notify("sources-change", [
      ...normalizeSrc(this.#media.$props.src()),
      ...this.#domSources()
    ]);
  }
  #onSourceChange() {
    const { $state } = this.#media;
    const sources = $state.sources(), currentSource = peek($state.source), newSource = this.#findNewSource(currentSource, sources), noMatch = sources[0]?.src && !newSource.src && !newSource.type;
    if (noMatch && !warned$1.has(newSource.src) && !peek(this.#loader)) {
      const source = sources[0];
      console.warn(
        `[vidstack] could not find a loader for any of the given media sources, consider providing \`type\`:

--- HTML ---

<media-provider>
  <source src="${source.src}" type="video/mp4" />
</media-provider>"

--- React ---

<MediaPlayer src={{ src: "${source.src}", type: "video/mp4" }}>

---

Falling back to fetching source headers...`
      );
      warned$1.add(newSource.src);
    }
    if (noMatch) {
      const { crossOrigin } = $state, credentials = getRequestCredentials(crossOrigin()), abort = new AbortController();
      Promise.all(
        sources.map(
          (source) => isString(source.src) && source.type === "?" ? fetch(source.src, {
            method: "HEAD",
            credentials,
            signal: abort.signal
          }).then((res) => {
            source.type = res.headers.get("content-type") || "??";
            sourceTypes.set(source.src, source.type);
            return source;
          }).catch(() => source) : source
        )
      ).then((sources2) => {
        if (abort.signal.aborted) return;
        const newSource2 = this.#findNewSource(peek($state.source), sources2);
        tick();
        if (!newSource2.src) {
          this.#media.notify("error", {
            message: "Failed to load resource.",
            code: 4
          });
        }
      });
      return () => abort.abort();
    }
    tick();
  }
  #findNewSource(currentSource, sources) {
    let newSource = { src: "", type: "" }, newLoader = null, triggerEvent = new DOMEvent("sources-change", { detail: { sources } }), loaders = this.#loaders(), { started, paused, currentTime, quality, savedState } = this.#media.$state;
    for (const src of sources) {
      const loader = loaders.find((loader2) => loader2.canPlay(src));
      if (loader) {
        newSource = src;
        newLoader = loader;
        break;
      }
    }
    if (isVideoQualitySrc(newSource)) {
      const currentQuality = quality(), sourceQuality = sources.find((s) => s.src === currentQuality?.src);
      if (peek(started)) {
        savedState.set({
          paused: peek(paused),
          currentTime: peek(currentTime)
        });
      } else {
        savedState.set(null);
      }
      if (sourceQuality) {
        newSource = sourceQuality;
        triggerEvent = new DOMEvent("quality-change", {
          detail: { quality: currentQuality }
        });
      }
    }
    if (!isSameSrc(currentSource, newSource)) {
      this.#notifySourceChange(newSource, newLoader, triggerEvent);
    }
    if (newLoader !== peek(this.#loader)) {
      this.#notifyLoaderChange(newLoader, triggerEvent);
    }
    return newSource;
  }
  #notifySourceChange(src, loader, trigger) {
    this.#media.notify("source-change", src, trigger);
    this.#media.notify("media-type-change", loader?.mediaType(src) || "unknown", trigger);
  }
  #notifyLoaderChange(loader, trigger) {
    this.#media.$providerSetup.set(false);
    this.#media.notify("provider-change", null, trigger);
    loader && peek(() => loader.preconnect?.(this.#media));
    this.#loader.set(loader);
    this.#media.notify("provider-loader-change", loader, trigger);
  }
  #onSetup() {
    const provider = this.#media.$provider();
    if (!provider || peek(this.#media.$providerSetup)) return;
    if (this.#media.$state.canLoad()) {
      scoped(() => provider.setup(), provider.scope);
      this.#media.$providerSetup.set(true);
      return;
    }
    peek(() => provider.preconnect?.());
  }
  #onLoadSource() {
    if (!this.#media.$providerSetup()) return;
    const provider = this.#media.$provider(), source = this.#media.$state.source(), crossOrigin = peek(this.#media.$state.crossOrigin), preferNativeHLS = peek(this.#media.$props.preferNativeHLS);
    if (isSameSrc(provider?.currentSrc, source)) {
      return;
    }
    if (this.#media.$state.canLoad()) {
      const abort = new AbortController();
      if (isHLSSrc(source)) {
        if (preferNativeHLS || !isHLSSupported()) {
          resolveStreamTypeFromHLSManifest(source.src, {
            credentials: getRequestCredentials(crossOrigin),
            signal: abort.signal
          }).then((streamType) => {
            this.#media.notify("stream-type-change", streamType);
          }).catch(noop);
        }
      } else if (isDASHSrc(source)) {
        resolveStreamTypeFromDASHManifest(source.src, {
          credentials: getRequestCredentials(crossOrigin),
          signal: abort.signal
        }).then((streamType) => {
          this.#media.notify("stream-type-change", streamType);
        }).catch(noop);
      } else {
        this.#media.notify("stream-type-change", "on-demand");
      }
      peek(() => {
        const preload = peek(this.#media.$state.preload);
        return provider?.loadSource(source, preload).catch((error) => {
          {
            this.#media.logger?.errorGroup("[vidstack] failed to load source").labelledLog("Error", error).labelledLog("Source", source).labelledLog("Provider", provider).labelledLog("Media Context", { ...this.#media }).dispatch();
          }
        });
      });
      return () => abort.abort();
    }
    try {
      isString(source.src) && preconnect(new URL(source.src).origin);
    } catch (error) {
      {
        this.#media.logger?.infoGroup(`Failed to preconnect to source: ${source.src}`).labelledLog("Error", error).dispatch();
      }
    }
  }
  #onLoadPoster() {
    const loader = this.#loader(), { providedPoster, source, canLoadPoster } = this.#media.$state;
    if (!loader || !loader.loadPoster || !source() || !canLoadPoster() || providedPoster()) return;
    const abort = new AbortController(), trigger = new DOMEvent("source-change", { detail: source });
    loader.loadPoster(source(), this.#media, abort).then((url) => {
      this.#media.notify("poster-change", url || "", trigger);
    }).catch(() => {
      this.#media.notify("poster-change", "", trigger);
    });
    return () => {
      abort.abort();
    };
  }
}
function normalizeSrc(src) {
  return (isArray$1(src) ? src : [src]).map((src2) => {
    if (isString(src2)) {
      return { src: src2, type: inferType(src2) };
    } else {
      return { ...src2, type: inferType(src2.src, src2.type) };
    }
  });
}
function inferType(src, type) {
  if (isString(type) && type.length) {
    return type;
  } else if (isString(src) && sourceTypes.has(src)) {
    return sourceTypes.get(src);
  } else if (!type && isHLSSrc({ src, type: "" })) {
    return "application/x-mpegurl";
  } else if (!type && isDASHSrc({ src, type: "" })) {
    return "application/dash+xml";
  } else if (!isString(src) || src.startsWith("blob:")) {
    return "video/object";
  } else if (src.includes("youtube") || src.includes("youtu.be")) {
    return "video/youtube";
  } else if (src.includes("vimeo") && !src.includes("progressive_redirect") && !src.includes(".m3u8")) {
    return "video/vimeo";
  }
  return "?";
}
function isSameSrc(a, b) {
  return a?.src === b?.src && a?.type === b?.type;
}

class Tracks {
  #domTracks;
  #media;
  #prevTracks = [];
  constructor(domTracks, media) {
    this.#domTracks = domTracks;
    this.#media = media;
    effect(this.#onTracksChange.bind(this));
  }
  #onTracksChange() {
    const newTracks = this.#domTracks();
    for (const oldTrack of this.#prevTracks) {
      if (!newTracks.some((t) => t.id === oldTrack.id)) {
        const track = oldTrack.id && this.#media.textTracks.getById(oldTrack.id);
        if (track) this.#media.textTracks.remove(track);
      }
    }
    for (const newTrack of newTracks) {
      const id = newTrack.id || TextTrack.createId(newTrack);
      if (!this.#media.textTracks.getById(id)) {
        newTrack.id = id;
        this.#media.textTracks.add(newTrack);
      }
    }
    this.#prevTracks = newTracks;
  }
}

class MediaProvider extends Component {
  static props = {
    loaders: []
  };
  static state = new State({
    loader: null
  });
  #media;
  #sources;
  #domSources = signal([]);
  #domTracks = signal([]);
  #loader = null;
  onSetup() {
    this.#media = useMediaContext();
    this.#sources = new SourceSelection(
      this.#domSources,
      this.#media,
      this.$state.loader,
      this.$props.loaders()
    );
  }
  onAttach(el) {
    el.setAttribute("data-media-provider", "");
  }
  onConnect(el) {
    this.#sources.connect();
    new Tracks(this.#domTracks, this.#media);
    const resize = new ResizeObserver(animationFrameThrottle(this.#onResize.bind(this)));
    resize.observe(el);
    const mutations = new MutationObserver(this.#onMutation.bind(this));
    mutations.observe(el, { attributes: true, childList: true });
    this.#onResize();
    this.#onMutation();
    onDispose(() => {
      resize.disconnect();
      mutations.disconnect();
    });
  }
  #loadRafId = -1;
  load(target) {
    target?.setAttribute("aria-hidden", "true");
    window.cancelAnimationFrame(this.#loadRafId);
    this.#loadRafId = requestAnimationFrame(() => this.#runLoader(target));
    onDispose(() => {
      window.cancelAnimationFrame(this.#loadRafId);
    });
  }
  #runLoader(target) {
    if (!this.scope) return;
    const loader = this.$state.loader(), { $provider } = this.#media;
    if (this.#loader === loader && loader?.target === target && peek($provider)) return;
    this.#destroyProvider();
    this.#loader = loader;
    if (loader) loader.target = target || null;
    if (!loader || !target) return;
    loader.load(this.#media).then((provider) => {
      if (!this.scope) return;
      if (peek(this.$state.loader) !== loader) return;
      this.#media.notify("provider-change", provider);
    });
  }
  onDestroy() {
    this.#loader = null;
    this.#destroyProvider();
  }
  #destroyProvider() {
    this.#media?.notify("provider-change", null);
  }
  #onResize() {
    if (!this.el) return;
    const { player, $state } = this.#media, width = this.el.offsetWidth, height = this.el.offsetHeight;
    if (!player) return;
    $state.mediaWidth.set(width);
    $state.mediaHeight.set(height);
    if (player.el) {
      setStyle(player.el, "--media-width", width + "px");
      setStyle(player.el, "--media-height", height + "px");
    }
  }
  #onMutation() {
    const sources = [], tracks = [], children = this.el.children;
    for (const el of children) {
      if (el.hasAttribute("data-vds")) continue;
      if (el instanceof HTMLSourceElement) {
        const src = {
          id: el.id,
          src: el.src,
          type: el.type
        };
        for (const prop of ["id", "src", "width", "height", "bitrate", "codec"]) {
          const value = el.getAttribute(`data-${prop}`);
          if (isString(value)) src[prop] = /id|src|codec/.test(prop) ? value : Number(value);
        }
        sources.push(src);
      } else if (el instanceof HTMLTrackElement) {
        const track = {
          src: el.src,
          kind: el.track.kind,
          language: el.srclang,
          label: el.label,
          default: el.default,
          type: el.getAttribute("data-type")
        };
        tracks.push({
          id: el.id || TextTrack.createId(track),
          ...track
        });
      }
    }
    this.#domSources.set(sources);
    this.#domTracks.set(tracks);
    tick();
  }
}
const mediaprovider__proto = MediaProvider.prototype;
method(mediaprovider__proto, "load");

class MediaProviderElement extends Host(HTMLElement, MediaProvider) {
  static tagName = "media-provider";
  #media;
  #target = null;
  #blocker = null;
  onSetup() {
    this.#media = useMediaContext();
    this.setAttribute("keep-alive", "");
  }
  onDestroy() {
    this.#blocker?.remove();
    this.#blocker = null;
    this.#target?.remove();
    this.#target = null;
  }
  onConnect() {
    effect(() => {
      const loader = this.$state.loader(), isYouTubeEmbed = loader?.name === "youtube", isVimeoEmbed = loader?.name === "vimeo", isEmbed = isYouTubeEmbed || isVimeoEmbed, isGoogleCast = loader?.name === "google-cast";
      const target = loader ? isGoogleCast ? this.#createGoogleCastContainer() : isEmbed ? this.#createIFrame() : loader.mediaType() === "audio" ? this.#createAudio() : this.#createVideo() : null;
      if (this.#target !== target) {
        const parent = this.#target?.parentElement ?? this;
        this.#target?.remove();
        this.#target = target;
        if (target) parent.prepend(target);
        if (isEmbed && target) {
          effect(() => {
            const { nativeControls, viewType } = this.#media.$state, showNativeControls = nativeControls(), isAudioView = viewType() === "audio", showBlocker = !showNativeControls && !isAudioView;
            if (showBlocker) {
              this.#blocker = this.querySelector(".vds-blocker");
              if (!this.#blocker) {
                this.#blocker = document.createElement("div");
                this.#blocker.classList.add("vds-blocker");
                target.after(this.#blocker);
              }
            } else {
              this.#blocker?.remove();
              this.#blocker = null;
            }
            setAttribute(target, "data-no-controls", !showNativeControls);
          });
        }
      }
      if (isYouTubeEmbed) target?.classList.add("vds-youtube");
      else if (isVimeoEmbed) target?.classList.add("vds-vimeo");
      if (!isEmbed) {
        this.#blocker?.remove();
        this.#blocker = null;
      }
      this.load(target);
    });
  }
  #createAudio() {
    const audio = this.#target instanceof HTMLAudioElement ? this.#target : document.createElement("audio");
    const { controls, crossOrigin } = this.#media.$state;
    effect(() => {
      setAttribute(audio, "controls", controls());
      setAttribute(audio, "crossorigin", crossOrigin());
    });
    return audio;
  }
  #createVideo() {
    const video = this.#target instanceof HTMLVideoElement ? this.#target : document.createElement("video");
    const { crossOrigin, poster, nativeControls } = this.#media.$state, $controls = computed(() => nativeControls() ? "true" : null), $poster = computed(() => poster() && nativeControls() ? poster() : null);
    effect(() => {
      setAttribute(video, "controls", $controls());
      setAttribute(video, "crossorigin", crossOrigin());
      setAttribute(video, "poster", $poster());
    });
    return video;
  }
  #createIFrame() {
    const iframe = this.#target instanceof HTMLIFrameElement ? this.#target : document.createElement("iframe"), { nativeControls } = this.#media.$state;
    effect(() => setAttribute(iframe, "tabindex", !nativeControls() ? -1 : null));
    return iframe;
  }
  #createGoogleCastContainer() {
    if (this.#target?.classList.contains("vds-google-cast")) {
      return this.#target;
    }
    const container = document.createElement("div");
    container.classList.add("vds-google-cast");
    Promise.resolve().then(function () { return providerCastDisplay; }).then(({ insertContent }) => {
      insertContent(container, this.#media.$state);
    });
    return container;
  }
}

defineCustomElement(MediaPlayerElement);
defineCustomElement(MediaProviderElement);

const defaultLayoutContext = createContext();
function useDefaultLayoutContext() {
  return useContext(defaultLayoutContext);
}

const defaultLayoutProps = {
  colorScheme: "system",
  download: null,
  customIcons: false,
  disableTimeSlider: false,
  menuContainer: null,
  menuGroup: "bottom",
  noAudioGain: false,
  noGestures: false,
  noKeyboardAnimations: false,
  noModal: false,
  noScrubGesture: false,
  playbackRates: { min: 0, max: 2, step: 0.25 },
  audioGains: { min: 0, max: 300, step: 25 },
  seekStep: 10,
  sliderChaptersMinWidth: 325,
  hideQualityBitrate: false,
  smallWhen: false,
  thumbnails: null,
  translations: null,
  when: false
};

class DefaultLayout extends Component {
  static props = defaultLayoutProps;
  #media;
  #when = computed(() => {
    const when = this.$props.when();
    return this.#matches(when);
  });
  #smallWhen = computed(() => {
    const when = this.$props.smallWhen();
    return this.#matches(when);
  });
  get isMatch() {
    return this.#when();
  }
  get isSmallLayout() {
    return this.#smallWhen();
  }
  onSetup() {
    this.#media = useMediaContext();
    this.setAttributes({
      "data-match": this.#when,
      "data-sm": () => this.#smallWhen() ? "" : null,
      "data-lg": () => !this.#smallWhen() ? "" : null,
      "data-size": () => this.#smallWhen() ? "sm" : "lg",
      "data-no-scrub-gesture": this.$props.noScrubGesture
    });
    provideContext(defaultLayoutContext, {
      ...this.$props,
      when: this.#when,
      smallWhen: this.#smallWhen,
      userPrefersAnnouncements: signal(true),
      userPrefersKeyboardAnimations: signal(true),
      menuPortal: signal(null)
    });
  }
  onAttach(el) {
    watchColorScheme(el, this.$props.colorScheme);
  }
  #matches(query) {
    return query !== "never" && (isBoolean(query) ? query : computed(() => query(this.#media.player.state))());
  }
}
const defaultlayout__proto = DefaultLayout.prototype;
prop(defaultlayout__proto, "isMatch");
prop(defaultlayout__proto, "isSmallLayout");

let DefaultAudioLayout$1 = class DefaultAudioLayout extends DefaultLayout {
  static props = {
    ...super.props,
    when: ({ viewType }) => viewType === "audio",
    smallWhen: ({ width }) => width < 576
  };
};

/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var _a$1, _b$1, _c, _d;
const global = window;
const debugLogEvent = (event) => {
  const shouldEmit = global.emitLitDebugLogEvents;
  if (!shouldEmit) {
    return;
  }
  global.dispatchEvent(new CustomEvent("lit-debug", {
    detail: event
  }));
} ;
let debugLogRenderId = 0;
let issueWarning;
{
  (_a$1 = global.litIssuedWarnings) !== null && _a$1 !== void 0 ? _a$1 : global.litIssuedWarnings = /* @__PURE__ */ new Set();
  issueWarning = (code, warning) => {
    warning += code ? ` See https://lit.dev/msg/${code} for more information.` : "";
    if (!global.litIssuedWarnings.has(warning)) {
      console.warn(warning);
      global.litIssuedWarnings.add(warning);
    }
  };
  issueWarning("dev-mode", `Lit is in dev mode. Not recommended for production!`);
}
const wrap = ((_b$1 = global.ShadyDOM) === null || _b$1 === void 0 ? void 0 : _b$1.inUse) && ((_c = global.ShadyDOM) === null || _c === void 0 ? void 0 : _c.noPatch) === true ? global.ShadyDOM.wrap : (node) => node;
const trustedTypes = global.trustedTypes;
const policy = trustedTypes ? trustedTypes.createPolicy("lit-html", {
  createHTML: (s) => s
}) : void 0;
const identityFunction = (value) => value;
const noopSanitizer = (_node, _name, _type) => identityFunction;
const setSanitizer = (newSanitizer) => {
  if (sanitizerFactoryInternal !== noopSanitizer) {
    throw new Error(`Attempted to overwrite existing lit-html security policy. setSanitizeDOMValueFactory should be called at most once.`);
  }
  sanitizerFactoryInternal = newSanitizer;
};
const _testOnlyClearSanitizerFactoryDoNotCallOrElse = () => {
  sanitizerFactoryInternal = noopSanitizer;
};
const createSanitizer = (node, name, type) => {
  return sanitizerFactoryInternal(node, name, type);
};
const boundAttributeSuffix = "$lit$";
const marker = `lit$${String(Math.random()).slice(9)}$`;
const markerMatch = "?" + marker;
const nodeMarker = `<${markerMatch}>`;
const d = document;
const createMarker = () => d.createComment("");
const isPrimitive = (value) => value === null || typeof value != "object" && typeof value != "function";
const isArray = Array.isArray;
const isIterable = (value) => isArray(value) || // eslint-disable-next-line @typescript-eslint/no-explicit-any
typeof (value === null || value === void 0 ? void 0 : value[Symbol.iterator]) === "function";
const SPACE_CHAR = `[ 	
\f\r]`;
const ATTR_VALUE_CHAR = `[^ 	
\f\r"'\`<>=]`;
const NAME_CHAR = `[^\\s"'>=/]`;
const textEndRegex = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
const COMMENT_START = 1;
const TAG_NAME = 2;
const DYNAMIC_TAG_NAME = 3;
const commentEndRegex = /-->/g;
const comment2EndRegex = />/g;
const tagEndRegex = new RegExp(`>|${SPACE_CHAR}(?:(${NAME_CHAR}+)(${SPACE_CHAR}*=${SPACE_CHAR}*(?:${ATTR_VALUE_CHAR}|("|')|))|$)`, "g");
const ENTIRE_MATCH = 0;
const ATTRIBUTE_NAME = 1;
const SPACES_AND_EQUALS = 2;
const QUOTE_CHAR = 3;
const singleQuoteAttrEndRegex = /'/g;
const doubleQuoteAttrEndRegex = /"/g;
const rawTextElement = /^(?:script|style|textarea|title)$/i;
const HTML_RESULT$1 = 1;
const SVG_RESULT$1 = 2;
const ATTRIBUTE_PART = 1;
const CHILD_PART = 2;
const PROPERTY_PART = 3;
const BOOLEAN_ATTRIBUTE_PART = 4;
const EVENT_PART = 5;
const ELEMENT_PART = 6;
const COMMENT_PART = 7;
const tag = (type) => (strings, ...values) => {
  if (strings.some((s) => s === void 0)) {
    console.warn("Some template strings are undefined.\nThis is probably caused by illegal octal escape sequences.");
  }
  return {
    // This property needs to remain unminified.
    ["_$litType$"]: type,
    strings,
    values
  };
};
const html = tag(HTML_RESULT$1);
const noChange = Symbol.for("lit-noChange");
const nothing = Symbol.for("lit-nothing");
const templateCache = /* @__PURE__ */ new WeakMap();
const walker = d.createTreeWalker(d, 129, null, false);
let sanitizerFactoryInternal = noopSanitizer;
function trustFromTemplateString(tsa, stringFromTSA) {
  if (!Array.isArray(tsa) || !tsa.hasOwnProperty("raw")) {
    let message = "invalid template strings array";
    {
      message = `
          Internal Error: expected template strings to be an array
          with a 'raw' field. Faking a template strings array by
          calling html or svg like an ordinary function is effectively
          the same as calling unsafeHtml and can lead to major security
          issues, e.g. opening your code up to XSS attacks.
          If you're using the html or svg tagged template functions normally
          and still seeing this error, please file a bug at
          https://github.com/lit/lit/issues/new?template=bug_report.md
          and include information about your build tooling, if any.
        `.trim().replace(/\n */g, "\n");
    }
    throw new Error(message);
  }
  return policy !== void 0 ? policy.createHTML(stringFromTSA) : stringFromTSA;
}
const getTemplateHtml = (strings, type) => {
  const l = strings.length - 1;
  const attrNames = [];
  let html2 = type === SVG_RESULT$1 ? "<svg>" : "";
  let rawTextEndRegex;
  let regex = textEndRegex;
  for (let i = 0; i < l; i++) {
    const s = strings[i];
    let attrNameEndIndex = -1;
    let attrName;
    let lastIndex = 0;
    let match;
    while (lastIndex < s.length) {
      regex.lastIndex = lastIndex;
      match = regex.exec(s);
      if (match === null) {
        break;
      }
      lastIndex = regex.lastIndex;
      if (regex === textEndRegex) {
        if (match[COMMENT_START] === "!--") {
          regex = commentEndRegex;
        } else if (match[COMMENT_START] !== void 0) {
          regex = comment2EndRegex;
        } else if (match[TAG_NAME] !== void 0) {
          if (rawTextElement.test(match[TAG_NAME])) {
            rawTextEndRegex = new RegExp(`</${match[TAG_NAME]}`, "g");
          }
          regex = tagEndRegex;
        } else if (match[DYNAMIC_TAG_NAME] !== void 0) {
          {
            throw new Error("Bindings in tag names are not supported. Please use static templates instead. See https://lit.dev/docs/templates/expressions/#static-expressions");
          }
        }
      } else if (regex === tagEndRegex) {
        if (match[ENTIRE_MATCH] === ">") {
          regex = rawTextEndRegex !== null && rawTextEndRegex !== void 0 ? rawTextEndRegex : textEndRegex;
          attrNameEndIndex = -1;
        } else if (match[ATTRIBUTE_NAME] === void 0) {
          attrNameEndIndex = -2;
        } else {
          attrNameEndIndex = regex.lastIndex - match[SPACES_AND_EQUALS].length;
          attrName = match[ATTRIBUTE_NAME];
          regex = match[QUOTE_CHAR] === void 0 ? tagEndRegex : match[QUOTE_CHAR] === '"' ? doubleQuoteAttrEndRegex : singleQuoteAttrEndRegex;
        }
      } else if (regex === doubleQuoteAttrEndRegex || regex === singleQuoteAttrEndRegex) {
        regex = tagEndRegex;
      } else if (regex === commentEndRegex || regex === comment2EndRegex) {
        regex = textEndRegex;
      } else {
        regex = tagEndRegex;
        rawTextEndRegex = void 0;
      }
    }
    {
      console.assert(attrNameEndIndex === -1 || regex === tagEndRegex || regex === singleQuoteAttrEndRegex || regex === doubleQuoteAttrEndRegex, "unexpected parse state B");
    }
    const end = regex === tagEndRegex && strings[i + 1].startsWith("/>") ? " " : "";
    html2 += regex === textEndRegex ? s + nodeMarker : attrNameEndIndex >= 0 ? (attrNames.push(attrName), s.slice(0, attrNameEndIndex) + boundAttributeSuffix + s.slice(attrNameEndIndex)) + marker + end : s + marker + (attrNameEndIndex === -2 ? (attrNames.push(void 0), i) : end);
  }
  const htmlResult = html2 + (strings[l] || "<?>") + (type === SVG_RESULT$1 ? "</svg>" : "");
  return [trustFromTemplateString(strings, htmlResult), attrNames];
};
class Template {
  constructor({ strings, ["_$litType$"]: type }, options) {
    this.parts = [];
    let node;
    let nodeIndex = 0;
    let attrNameIndex = 0;
    const partCount = strings.length - 1;
    const parts = this.parts;
    const [html2, attrNames] = getTemplateHtml(strings, type);
    this.el = Template.createElement(html2, options);
    walker.currentNode = this.el.content;
    if (type === SVG_RESULT$1) {
      const content = this.el.content;
      const svgElement = content.firstChild;
      svgElement.remove();
      content.append(...svgElement.childNodes);
    }
    while ((node = walker.nextNode()) !== null && parts.length < partCount) {
      if (node.nodeType === 1) {
        {
          const tag2 = node.localName;
          if (/^(?:textarea|template)$/i.test(tag2) && node.innerHTML.includes(marker)) {
            const m = `Expressions are not supported inside \`${tag2}\` elements. See https://lit.dev/msg/expression-in-${tag2} for more information.`;
            if (tag2 === "template") {
              throw new Error(m);
            } else
              issueWarning("", m);
          }
        }
        if (node.hasAttributes()) {
          const attrsToRemove = [];
          for (const name of node.getAttributeNames()) {
            if (name.endsWith(boundAttributeSuffix) || name.startsWith(marker)) {
              const realName = attrNames[attrNameIndex++];
              attrsToRemove.push(name);
              if (realName !== void 0) {
                const value = node.getAttribute(realName.toLowerCase() + boundAttributeSuffix);
                const statics = value.split(marker);
                const m = /([.?@])?(.*)/.exec(realName);
                parts.push({
                  type: ATTRIBUTE_PART,
                  index: nodeIndex,
                  name: m[2],
                  strings: statics,
                  ctor: m[1] === "." ? PropertyPart : m[1] === "?" ? BooleanAttributePart : m[1] === "@" ? EventPart : AttributePart
                });
              } else {
                parts.push({
                  type: ELEMENT_PART,
                  index: nodeIndex
                });
              }
            }
          }
          for (const name of attrsToRemove) {
            node.removeAttribute(name);
          }
        }
        if (rawTextElement.test(node.tagName)) {
          const strings2 = node.textContent.split(marker);
          const lastIndex = strings2.length - 1;
          if (lastIndex > 0) {
            node.textContent = trustedTypes ? trustedTypes.emptyScript : "";
            for (let i = 0; i < lastIndex; i++) {
              node.append(strings2[i], createMarker());
              walker.nextNode();
              parts.push({ type: CHILD_PART, index: ++nodeIndex });
            }
            node.append(strings2[lastIndex], createMarker());
          }
        }
      } else if (node.nodeType === 8) {
        const data = node.data;
        if (data === markerMatch) {
          parts.push({ type: CHILD_PART, index: nodeIndex });
        } else {
          let i = -1;
          while ((i = node.data.indexOf(marker, i + 1)) !== -1) {
            parts.push({ type: COMMENT_PART, index: nodeIndex });
            i += marker.length - 1;
          }
        }
      }
      nodeIndex++;
    }
    debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
      kind: "template prep",
      template: this,
      clonableTemplate: this.el,
      parts: this.parts,
      strings
    });
  }
  // Overridden via `litHtmlPolyfillSupport` to provide platform support.
  /** @nocollapse */
  static createElement(html2, _options) {
    const el = d.createElement("template");
    el.innerHTML = html2;
    return el;
  }
}
function resolveDirective(part, value, parent = part, attributeIndex) {
  var _a2, _b2, _c2;
  var _d2;
  if (value === noChange) {
    return value;
  }
  let currentDirective = attributeIndex !== void 0 ? (_a2 = parent.__directives) === null || _a2 === void 0 ? void 0 : _a2[attributeIndex] : parent.__directive;
  const nextDirectiveConstructor = isPrimitive(value) ? void 0 : (
    // This property needs to remain unminified.
    value["_$litDirective$"]
  );
  if ((currentDirective === null || currentDirective === void 0 ? void 0 : currentDirective.constructor) !== nextDirectiveConstructor) {
    (_b2 = currentDirective === null || currentDirective === void 0 ? void 0 : currentDirective["_$notifyDirectiveConnectionChanged"]) === null || _b2 === void 0 ? void 0 : _b2.call(currentDirective, false);
    if (nextDirectiveConstructor === void 0) {
      currentDirective = void 0;
    } else {
      currentDirective = new nextDirectiveConstructor(part);
      currentDirective._$initialize(part, parent, attributeIndex);
    }
    if (attributeIndex !== void 0) {
      ((_c2 = (_d2 = parent).__directives) !== null && _c2 !== void 0 ? _c2 : _d2.__directives = [])[attributeIndex] = currentDirective;
    } else {
      parent.__directive = currentDirective;
    }
  }
  if (currentDirective !== void 0) {
    value = resolveDirective(part, currentDirective._$resolve(part, value.values), currentDirective, attributeIndex);
  }
  return value;
}
class TemplateInstance {
  constructor(template, parent) {
    this._$parts = [];
    this._$disconnectableChildren = void 0;
    this._$template = template;
    this._$parent = parent;
  }
  // Called by ChildPart parentNode getter
  get parentNode() {
    return this._$parent.parentNode;
  }
  // See comment in Disconnectable interface for why this is a getter
  get _$isConnected() {
    return this._$parent._$isConnected;
  }
  // This method is separate from the constructor because we need to return a
  // DocumentFragment and we don't want to hold onto it with an instance field.
  _clone(options) {
    var _a2;
    const { el: { content }, parts } = this._$template;
    const fragment = ((_a2 = options === null || options === void 0 ? void 0 : options.creationScope) !== null && _a2 !== void 0 ? _a2 : d).importNode(content, true);
    walker.currentNode = fragment;
    let node = walker.nextNode();
    let nodeIndex = 0;
    let partIndex = 0;
    let templatePart = parts[0];
    while (templatePart !== void 0) {
      if (nodeIndex === templatePart.index) {
        let part;
        if (templatePart.type === CHILD_PART) {
          part = new ChildPart(node, node.nextSibling, this, options);
        } else if (templatePart.type === ATTRIBUTE_PART) {
          part = new templatePart.ctor(node, templatePart.name, templatePart.strings, this, options);
        } else if (templatePart.type === ELEMENT_PART) {
          part = new ElementPart(node, this, options);
        }
        this._$parts.push(part);
        templatePart = parts[++partIndex];
      }
      if (nodeIndex !== (templatePart === null || templatePart === void 0 ? void 0 : templatePart.index)) {
        node = walker.nextNode();
        nodeIndex++;
      }
    }
    walker.currentNode = d;
    return fragment;
  }
  _update(values) {
    let i = 0;
    for (const part of this._$parts) {
      if (part !== void 0) {
        debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
          kind: "set part",
          part,
          value: values[i],
          valueIndex: i,
          values,
          templateInstance: this
        });
        if (part.strings !== void 0) {
          part._$setValue(values, part, i);
          i += part.strings.length - 2;
        } else {
          part._$setValue(values[i]);
        }
      }
      i++;
    }
  }
}
class ChildPart {
  constructor(startNode, endNode, parent, options) {
    var _a2;
    this.type = CHILD_PART;
    this._$committedValue = nothing;
    this._$disconnectableChildren = void 0;
    this._$startNode = startNode;
    this._$endNode = endNode;
    this._$parent = parent;
    this.options = options;
    this.__isConnected = (_a2 = options === null || options === void 0 ? void 0 : options.isConnected) !== null && _a2 !== void 0 ? _a2 : true;
    {
      this._textSanitizer = void 0;
    }
  }
  // See comment in Disconnectable interface for why this is a getter
  get _$isConnected() {
    var _a2, _b2;
    return (_b2 = (_a2 = this._$parent) === null || _a2 === void 0 ? void 0 : _a2._$isConnected) !== null && _b2 !== void 0 ? _b2 : this.__isConnected;
  }
  /**
   * The parent node into which the part renders its content.
   *
   * A ChildPart's content consists of a range of adjacent child nodes of
   * `.parentNode`, possibly bordered by 'marker nodes' (`.startNode` and
   * `.endNode`).
   *
   * - If both `.startNode` and `.endNode` are non-null, then the part's content
   * consists of all siblings between `.startNode` and `.endNode`, exclusively.
   *
   * - If `.startNode` is non-null but `.endNode` is null, then the part's
   * content consists of all siblings following `.startNode`, up to and
   * including the last child of `.parentNode`. If `.endNode` is non-null, then
   * `.startNode` will always be non-null.
   *
   * - If both `.endNode` and `.startNode` are null, then the part's content
   * consists of all child nodes of `.parentNode`.
   */
  get parentNode() {
    let parentNode = wrap(this._$startNode).parentNode;
    const parent = this._$parent;
    if (parent !== void 0 && (parentNode === null || parentNode === void 0 ? void 0 : parentNode.nodeType) === 11) {
      parentNode = parent.parentNode;
    }
    return parentNode;
  }
  /**
   * The part's leading marker node, if any. See `.parentNode` for more
   * information.
   */
  get startNode() {
    return this._$startNode;
  }
  /**
   * The part's trailing marker node, if any. See `.parentNode` for more
   * information.
   */
  get endNode() {
    return this._$endNode;
  }
  _$setValue(value, directiveParent = this) {
    var _a2;
    if (this.parentNode === null) {
      throw new Error(`This \`ChildPart\` has no \`parentNode\` and therefore cannot accept a value. This likely means the element containing the part was manipulated in an unsupported way outside of Lit's control such that the part's marker nodes were ejected from DOM. For example, setting the element's \`innerHTML\` or \`textContent\` can do this.`);
    }
    value = resolveDirective(this, value, directiveParent);
    if (isPrimitive(value)) {
      if (value === nothing || value == null || value === "") {
        if (this._$committedValue !== nothing) {
          debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
            kind: "commit nothing to child",
            start: this._$startNode,
            end: this._$endNode,
            parent: this._$parent,
            options: this.options
          });
          this._$clear();
        }
        this._$committedValue = nothing;
      } else if (value !== this._$committedValue && value !== noChange) {
        this._commitText(value);
      }
    } else if (value["_$litType$"] !== void 0) {
      this._commitTemplateResult(value);
    } else if (value.nodeType !== void 0) {
      if (((_a2 = this.options) === null || _a2 === void 0 ? void 0 : _a2.host) === value) {
        this._commitText(`[probable mistake: rendered a template's host in itself (commonly caused by writing \${this} in a template]`);
        console.warn(`Attempted to render the template host`, value, `inside itself. This is almost always a mistake, and in dev mode `, `we render some warning text. In production however, we'll `, `render it, which will usually result in an error, and sometimes `, `in the element disappearing from the DOM.`);
        return;
      }
      this._commitNode(value);
    } else if (isIterable(value)) {
      this._commitIterable(value);
    } else {
      this._commitText(value);
    }
  }
  _insert(node) {
    return wrap(wrap(this._$startNode).parentNode).insertBefore(node, this._$endNode);
  }
  _commitNode(value) {
    var _a2;
    if (this._$committedValue !== value) {
      this._$clear();
      if (sanitizerFactoryInternal !== noopSanitizer) {
        const parentNodeName = (_a2 = this._$startNode.parentNode) === null || _a2 === void 0 ? void 0 : _a2.nodeName;
        if (parentNodeName === "STYLE" || parentNodeName === "SCRIPT") {
          let message = "Forbidden";
          {
            if (parentNodeName === "STYLE") {
              message = `Lit does not support binding inside style nodes. This is a security risk, as style injection attacks can exfiltrate data and spoof UIs. Consider instead using css\`...\` literals to compose styles, and make do dynamic styling with css custom properties, ::parts, <slot>s, and by mutating the DOM rather than stylesheets.`;
            } else {
              message = `Lit does not support binding inside script nodes. This is a security risk, as it could allow arbitrary code execution.`;
            }
          }
          throw new Error(message);
        }
      }
      debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
        kind: "commit node",
        start: this._$startNode,
        parent: this._$parent,
        value,
        options: this.options
      });
      this._$committedValue = this._insert(value);
    }
  }
  _commitText(value) {
    if (this._$committedValue !== nothing && isPrimitive(this._$committedValue)) {
      const node = wrap(this._$startNode).nextSibling;
      {
        if (this._textSanitizer === void 0) {
          this._textSanitizer = createSanitizer(node, "data", "property");
        }
        value = this._textSanitizer(value);
      }
      debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
        kind: "commit text",
        node,
        value,
        options: this.options
      });
      node.data = value;
    } else {
      {
        const textNode = d.createTextNode("");
        this._commitNode(textNode);
        if (this._textSanitizer === void 0) {
          this._textSanitizer = createSanitizer(textNode, "data", "property");
        }
        value = this._textSanitizer(value);
        debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
          kind: "commit text",
          node: textNode,
          value,
          options: this.options
        });
        textNode.data = value;
      }
    }
    this._$committedValue = value;
  }
  _commitTemplateResult(result) {
    var _a2;
    const { values, ["_$litType$"]: type } = result;
    const template = typeof type === "number" ? this._$getTemplate(result) : (type.el === void 0 && (type.el = Template.createElement(trustFromTemplateString(type.h, type.h[0]), this.options)), type);
    if (((_a2 = this._$committedValue) === null || _a2 === void 0 ? void 0 : _a2._$template) === template) {
      debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
        kind: "template updating",
        template,
        instance: this._$committedValue,
        parts: this._$committedValue._$parts,
        options: this.options,
        values
      });
      this._$committedValue._update(values);
    } else {
      const instance = new TemplateInstance(template, this);
      const fragment = instance._clone(this.options);
      debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
        kind: "template instantiated",
        template,
        instance,
        parts: instance._$parts,
        options: this.options,
        fragment,
        values
      });
      instance._update(values);
      debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
        kind: "template instantiated and updated",
        template,
        instance,
        parts: instance._$parts,
        options: this.options,
        fragment,
        values
      });
      this._commitNode(fragment);
      this._$committedValue = instance;
    }
  }
  // Overridden via `litHtmlPolyfillSupport` to provide platform support.
  /** @internal */
  _$getTemplate(result) {
    let template = templateCache.get(result.strings);
    if (template === void 0) {
      templateCache.set(result.strings, template = new Template(result));
    }
    return template;
  }
  _commitIterable(value) {
    if (!isArray(this._$committedValue)) {
      this._$committedValue = [];
      this._$clear();
    }
    const itemParts = this._$committedValue;
    let partIndex = 0;
    let itemPart;
    for (const item of value) {
      if (partIndex === itemParts.length) {
        itemParts.push(itemPart = new ChildPart(this._insert(createMarker()), this._insert(createMarker()), this, this.options));
      } else {
        itemPart = itemParts[partIndex];
      }
      itemPart._$setValue(item);
      partIndex++;
    }
    if (partIndex < itemParts.length) {
      this._$clear(itemPart && wrap(itemPart._$endNode).nextSibling, partIndex);
      itemParts.length = partIndex;
    }
  }
  /**
   * Removes the nodes contained within this Part from the DOM.
   *
   * @param start Start node to clear from, for clearing a subset of the part's
   *     DOM (used when truncating iterables)
   * @param from  When `start` is specified, the index within the iterable from
   *     which ChildParts are being removed, used for disconnecting directives in
   *     those Parts.
   *
   * @internal
   */
  _$clear(start = wrap(this._$startNode).nextSibling, from) {
    var _a2;
    (_a2 = this._$notifyConnectionChanged) === null || _a2 === void 0 ? void 0 : _a2.call(this, false, true, from);
    while (start && start !== this._$endNode) {
      const n = wrap(start).nextSibling;
      wrap(start).remove();
      start = n;
    }
  }
  /**
   * Implementation of RootPart's `isConnected`. Note that this metod
   * should only be called on `RootPart`s (the `ChildPart` returned from a
   * top-level `render()` call). It has no effect on non-root ChildParts.
   * @param isConnected Whether to set
   * @internal
   */
  setConnected(isConnected) {
    var _a2;
    if (this._$parent === void 0) {
      this.__isConnected = isConnected;
      (_a2 = this._$notifyConnectionChanged) === null || _a2 === void 0 ? void 0 : _a2.call(this, isConnected);
    } else {
      throw new Error("part.setConnected() may only be called on a RootPart returned from render().");
    }
  }
}
class AttributePart {
  constructor(element, name, strings, parent, options) {
    this.type = ATTRIBUTE_PART;
    this._$committedValue = nothing;
    this._$disconnectableChildren = void 0;
    this.element = element;
    this.name = name;
    this._$parent = parent;
    this.options = options;
    if (strings.length > 2 || strings[0] !== "" || strings[1] !== "") {
      this._$committedValue = new Array(strings.length - 1).fill(new String());
      this.strings = strings;
    } else {
      this._$committedValue = nothing;
    }
    {
      this._sanitizer = void 0;
    }
  }
  get tagName() {
    return this.element.tagName;
  }
  // See comment in Disconnectable interface for why this is a getter
  get _$isConnected() {
    return this._$parent._$isConnected;
  }
  /**
   * Sets the value of this part by resolving the value from possibly multiple
   * values and static strings and committing it to the DOM.
   * If this part is single-valued, `this._strings` will be undefined, and the
   * method will be called with a single value argument. If this part is
   * multi-value, `this._strings` will be defined, and the method is called
   * with the value array of the part's owning TemplateInstance, and an offset
   * into the value array from which the values should be read.
   * This method is overloaded this way to eliminate short-lived array slices
   * of the template instance values, and allow a fast-path for single-valued
   * parts.
   *
   * @param value The part value, or an array of values for multi-valued parts
   * @param valueIndex the index to start reading values from. `undefined` for
   *   single-valued parts
   * @param noCommit causes the part to not commit its value to the DOM. Used
   *   in hydration to prime attribute parts with their first-rendered value,
   *   but not set the attribute, and in SSR to no-op the DOM operation and
   *   capture the value for serialization.
   *
   * @internal
   */
  _$setValue(value, directiveParent = this, valueIndex, noCommit) {
    const strings = this.strings;
    let change = false;
    if (strings === void 0) {
      value = resolveDirective(this, value, directiveParent, 0);
      change = !isPrimitive(value) || value !== this._$committedValue && value !== noChange;
      if (change) {
        this._$committedValue = value;
      }
    } else {
      const values = value;
      value = strings[0];
      let i, v;
      for (i = 0; i < strings.length - 1; i++) {
        v = resolveDirective(this, values[valueIndex + i], directiveParent, i);
        if (v === noChange) {
          v = this._$committedValue[i];
        }
        change || (change = !isPrimitive(v) || v !== this._$committedValue[i]);
        if (v === nothing) {
          value = nothing;
        } else if (value !== nothing) {
          value += (v !== null && v !== void 0 ? v : "") + strings[i + 1];
        }
        this._$committedValue[i] = v;
      }
    }
    if (change && !noCommit) {
      this._commitValue(value);
    }
  }
  /** @internal */
  _commitValue(value) {
    if (value === nothing) {
      wrap(this.element).removeAttribute(this.name);
    } else {
      {
        if (this._sanitizer === void 0) {
          this._sanitizer = sanitizerFactoryInternal(this.element, this.name, "attribute");
        }
        value = this._sanitizer(value !== null && value !== void 0 ? value : "");
      }
      debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
        kind: "commit attribute",
        element: this.element,
        name: this.name,
        value,
        options: this.options
      });
      wrap(this.element).setAttribute(this.name, value !== null && value !== void 0 ? value : "");
    }
  }
}
class PropertyPart extends AttributePart {
  constructor() {
    super(...arguments);
    this.type = PROPERTY_PART;
  }
  /** @internal */
  _commitValue(value) {
    {
      if (this._sanitizer === void 0) {
        this._sanitizer = sanitizerFactoryInternal(this.element, this.name, "property");
      }
      value = this._sanitizer(value);
    }
    debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
      kind: "commit property",
      element: this.element,
      name: this.name,
      value,
      options: this.options
    });
    this.element[this.name] = value === nothing ? void 0 : value;
  }
}
const emptyStringForBooleanAttribute = trustedTypes ? trustedTypes.emptyScript : "";
class BooleanAttributePart extends AttributePart {
  constructor() {
    super(...arguments);
    this.type = BOOLEAN_ATTRIBUTE_PART;
  }
  /** @internal */
  _commitValue(value) {
    debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
      kind: "commit boolean attribute",
      element: this.element,
      name: this.name,
      value: !!(value && value !== nothing),
      options: this.options
    });
    if (value && value !== nothing) {
      wrap(this.element).setAttribute(this.name, emptyStringForBooleanAttribute);
    } else {
      wrap(this.element).removeAttribute(this.name);
    }
  }
}
class EventPart extends AttributePart {
  constructor(element, name, strings, parent, options) {
    super(element, name, strings, parent, options);
    this.type = EVENT_PART;
    if (this.strings !== void 0) {
      throw new Error(`A \`<${element.localName}>\` has a \`@${name}=...\` listener with invalid content. Event listeners in templates must have exactly one expression and no surrounding text.`);
    }
  }
  // EventPart does not use the base _$setValue/_resolveValue implementation
  // since the dirty checking is more complex
  /** @internal */
  _$setValue(newListener, directiveParent = this) {
    var _a2;
    newListener = (_a2 = resolveDirective(this, newListener, directiveParent, 0)) !== null && _a2 !== void 0 ? _a2 : nothing;
    if (newListener === noChange) {
      return;
    }
    const oldListener = this._$committedValue;
    const shouldRemoveListener = newListener === nothing && oldListener !== nothing || newListener.capture !== oldListener.capture || newListener.once !== oldListener.once || newListener.passive !== oldListener.passive;
    const shouldAddListener = newListener !== nothing && (oldListener === nothing || shouldRemoveListener);
    debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
      kind: "commit event listener",
      element: this.element,
      name: this.name,
      value: newListener,
      options: this.options,
      removeListener: shouldRemoveListener,
      addListener: shouldAddListener,
      oldListener
    });
    if (shouldRemoveListener) {
      this.element.removeEventListener(this.name, this, oldListener);
    }
    if (shouldAddListener) {
      this.element.addEventListener(this.name, this, newListener);
    }
    this._$committedValue = newListener;
  }
  handleEvent(event) {
    var _a2, _b2;
    if (typeof this._$committedValue === "function") {
      this._$committedValue.call((_b2 = (_a2 = this.options) === null || _a2 === void 0 ? void 0 : _a2.host) !== null && _b2 !== void 0 ? _b2 : this.element, event);
    } else {
      this._$committedValue.handleEvent(event);
    }
  }
}
class ElementPart {
  constructor(element, parent, options) {
    this.element = element;
    this.type = ELEMENT_PART;
    this._$disconnectableChildren = void 0;
    this._$parent = parent;
    this.options = options;
  }
  // See comment in Disconnectable interface for why this is a getter
  get _$isConnected() {
    return this._$parent._$isConnected;
  }
  _$setValue(value) {
    debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
      kind: "commit to element binding",
      element: this.element,
      value,
      options: this.options
    });
    resolveDirective(this, value);
  }
}
const polyfillSupport = global.litHtmlPolyfillSupportDevMode ;
polyfillSupport === null || polyfillSupport === void 0 ? void 0 : polyfillSupport(Template, ChildPart);
((_d = global.litHtmlVersions) !== null && _d !== void 0 ? _d : global.litHtmlVersions = []).push("2.8.0");
if (global.litHtmlVersions.length > 1) {
  issueWarning("multiple-versions", `Multiple versions of Lit loaded. Loading multiple versions is not recommended.`);
}
const render = (value, container, options) => {
  var _a2, _b2;
  if (container == null) {
    throw new TypeError(`The container to render into may not be ${container}`);
  }
  const renderId = debugLogRenderId++ ;
  const partOwnerNode = (_a2 = options === null || options === void 0 ? void 0 : options.renderBefore) !== null && _a2 !== void 0 ? _a2 : container;
  let part = partOwnerNode["_$litPart$"];
  debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
    kind: "begin render",
    id: renderId,
    value,
    container,
    options,
    part
  });
  if (part === void 0) {
    const endNode = (_b2 = options === null || options === void 0 ? void 0 : options.renderBefore) !== null && _b2 !== void 0 ? _b2 : null;
    partOwnerNode["_$litPart$"] = part = new ChildPart(container.insertBefore(createMarker(), endNode), endNode, void 0, options !== null && options !== void 0 ? options : {});
  }
  part._$setValue(value);
  debugLogEvent === null || debugLogEvent === void 0 ? void 0 : debugLogEvent({
    kind: "end render",
    id: renderId,
    value,
    container,
    options,
    part
  });
  return part;
};
{
  render.setSanitizer = setSanitizer;
  render.createSanitizer = createSanitizer;
  {
    render._testOnlyClearSanitizerFactoryDoNotCallOrElse = _testOnlyClearSanitizerFactoryDoNotCallOrElse;
  }
}

/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var _a, _b;
((_a = window.ShadyDOM) === null || _a === void 0 ? void 0 : _a.inUse) && ((_b = window.ShadyDOM) === null || _b === void 0 ? void 0 : _b.noPatch) === true ? window.ShadyDOM.wrap : (node) => node;
const isSingleExpression = (part) => part.strings === void 0;
const RESET_VALUE = {};
const setCommittedValue = (part, value = RESET_VALUE) => part._$committedValue = value;

/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const PartType = {
  ATTRIBUTE: 1,
  CHILD: 2,
  PROPERTY: 3,
  BOOLEAN_ATTRIBUTE: 4,
  EVENT: 5,
  ELEMENT: 6
};
const directive = (c) => (...values) => ({
  // This property needs to remain unminified.
  ["_$litDirective$"]: c,
  values
});
class Directive {
  constructor(_partInfo) {
  }
  // See comment in Disconnectable interface for why this is a getter
  get _$isConnected() {
    return this._$parent._$isConnected;
  }
  /** @internal */
  _$initialize(part, parent, attributeIndex) {
    this.__part = part;
    this._$parent = parent;
    this.__attributeIndex = attributeIndex;
  }
  /** @internal */
  _$resolve(part, props) {
    return this.update(part, props);
  }
  update(_part, props) {
    return this.render(...props);
  }
}

const notifyChildrenConnectedChanged = (parent, isConnected) => {
  var _a, _b;
  const children = parent._$disconnectableChildren;
  if (children === void 0) {
    return false;
  }
  for (const obj of children) {
    (_b = (_a = obj)["_$notifyDirectiveConnectionChanged"]) === null || _b === void 0 ? void 0 : _b.call(_a, isConnected, false);
    notifyChildrenConnectedChanged(obj, isConnected);
  }
  return true;
};
const removeDisconnectableFromParent = (obj) => {
  let parent, children;
  do {
    if ((parent = obj._$parent) === void 0) {
      break;
    }
    children = parent._$disconnectableChildren;
    children.delete(obj);
    obj = parent;
  } while ((children === null || children === void 0 ? void 0 : children.size) === 0);
};
const addDisconnectableToParent = (obj) => {
  for (let parent; parent = obj._$parent; obj = parent) {
    let children = parent._$disconnectableChildren;
    if (children === void 0) {
      parent._$disconnectableChildren = children = /* @__PURE__ */ new Set();
    } else if (children.has(obj)) {
      break;
    }
    children.add(obj);
    installDisconnectAPI(parent);
  }
};
function reparentDisconnectables(newParent) {
  if (this._$disconnectableChildren !== void 0) {
    removeDisconnectableFromParent(this);
    this._$parent = newParent;
    addDisconnectableToParent(this);
  } else {
    this._$parent = newParent;
  }
}
function notifyChildPartConnectedChanged(isConnected, isClearingValue = false, fromPartIndex = 0) {
  const value = this._$committedValue;
  const children = this._$disconnectableChildren;
  if (children === void 0 || children.size === 0) {
    return;
  }
  if (isClearingValue) {
    if (Array.isArray(value)) {
      for (let i = fromPartIndex; i < value.length; i++) {
        notifyChildrenConnectedChanged(value[i], false);
        removeDisconnectableFromParent(value[i]);
      }
    } else if (value != null) {
      notifyChildrenConnectedChanged(value, false);
      removeDisconnectableFromParent(value);
    }
  } else {
    notifyChildrenConnectedChanged(this, isConnected);
  }
}
const installDisconnectAPI = (obj) => {
  var _a, _b;
  var _c, _d;
  if (obj.type == PartType.CHILD) {
    (_a = (_c = obj)._$notifyConnectionChanged) !== null && _a !== void 0 ? _a : _c._$notifyConnectionChanged = notifyChildPartConnectedChanged;
    (_b = (_d = obj)._$reparentDisconnectables) !== null && _b !== void 0 ? _b : _d._$reparentDisconnectables = reparentDisconnectables;
  }
};
class AsyncDirective extends Directive {
  constructor() {
    super(...arguments);
    this._$disconnectableChildren = void 0;
  }
  /**
   * Initialize the part with internal fields
   * @param part
   * @param parent
   * @param attributeIndex
   */
  _$initialize(part, parent, attributeIndex) {
    super._$initialize(part, parent, attributeIndex);
    addDisconnectableToParent(this);
    this.isConnected = part._$isConnected;
  }
  // This property needs to remain unminified.
  /**
   * Called from the core code when a directive is going away from a part (in
   * which case `shouldRemoveFromParent` should be true), and from the
   * `setChildrenConnected` helper function when recursively changing the
   * connection state of a tree (in which case `shouldRemoveFromParent` should
   * be false).
   *
   * @param isConnected
   * @param isClearingDirective - True when the directive itself is being
   *     removed; false when the tree is being disconnected
   * @internal
   */
  ["_$notifyDirectiveConnectionChanged"](isConnected, isClearingDirective = true) {
    var _a, _b;
    if (isConnected !== this.isConnected) {
      this.isConnected = isConnected;
      if (isConnected) {
        (_a = this.reconnected) === null || _a === void 0 ? void 0 : _a.call(this);
      } else {
        (_b = this.disconnected) === null || _b === void 0 ? void 0 : _b.call(this);
      }
    }
    if (isClearingDirective) {
      notifyChildrenConnectedChanged(this, isConnected);
      removeDisconnectableFromParent(this);
    }
  }
  /**
   * Sets the value of the directive's Part outside the normal `update`/`render`
   * lifecycle of a directive.
   *
   * This method should not be called synchronously from a directive's `update`
   * or `render`.
   *
   * @param directive The directive to update
   * @param value The value to set
   */
  setValue(value) {
    if (isSingleExpression(this.__part)) {
      this.__part._$setValue(value, this);
    } else {
      if (this.__attributeIndex === void 0) {
        throw new Error(`Expected this.__attributeIndex to be a number`);
      }
      const newValues = [...this.__part._$committedValue];
      newValues[this.__attributeIndex] = value;
      this.__part._$setValue(newValues, this, 0);
    }
  }
  /**
   * User callbacks for implementing logic to release any resources/subscriptions
   * that may have been retained by this directive. Since directives may also be
   * re-connected, `reconnected` should also be implemented to restore the
   * working state of the directive prior to the next render.
   */
  disconnected() {
  }
  reconnected() {
  }
}

const ifDefined = (value) => value !== null && value !== void 0 ? value : nothing;

class SignalDirective extends AsyncDirective {
  #signal = null;
  #isAttr = false;
  #stop = null;
  constructor(part) {
    super(part);
    this.#isAttr = part.type === PartType.ATTRIBUTE || part.type === PartType.BOOLEAN_ATTRIBUTE;
  }
  render(signal) {
    if (signal !== this.#signal) {
      this.disconnected();
      this.#signal = signal;
      if (this.isConnected) this.#watch();
    }
    return this.#signal ? this.#resolveValue(peek(this.#signal)) : nothing;
  }
  reconnected() {
    this.#watch();
  }
  disconnected() {
    this.#stop?.();
    this.#stop = null;
  }
  #watch() {
    if (!this.#signal) return;
    this.#stop = effect(this.#onValueChange.bind(this));
  }
  #resolveValue(value) {
    return this.#isAttr ? ifDefined(value) : value;
  }
  #setValue(value) {
    this.setValue(this.#resolveValue(value));
  }
  #onValueChange() {
    {
      try {
        this.#setValue(this.#signal?.());
      } catch (error) {
        if (error instanceof Error && error.message.includes("This `ChildPart` has no `parentNode`")) {
          const svelteDynamicImportExample = [
            "{#await import('./Player.svelte') then {default: Player}}",
            "  <svelte:component this={Player} />",
            "{/await}"
          ].join("\n");
          console.warn(
            `[vidstack] Failed to render most likely due to a hydration issue with your framework. Dynamically importing the player should resolve the issue.

Svelte Example:

${svelteDynamicImportExample}`
          );
        } else {
          console.error(error);
        }
      }
    }
  }
}
function $signal(compute) {
  return directive(SignalDirective)(computed(compute));
}

class LitElement extends HTMLElement {
  rootPart = null;
  connectedCallback() {
    this.rootPart = render(this.render(), this, {
      renderBefore: this.firstChild
    });
    this.rootPart.setConnected(true);
  }
  disconnectedCallback() {
    this.rootPart?.setConnected(false);
    this.rootPart = null;
    render(null, this);
  }
}

function setLayoutName(name, isMatch) {
  effect(() => {
    const { player } = useMediaContext(), el = player.el;
    el && setAttribute(el, "data-layout", isMatch() && name);
    return () => el?.removeAttribute("data-layout");
  });
}

class SlotObserver {
  #roots;
  #callback;
  elements = /* @__PURE__ */ new Set();
  constructor(roots, callback) {
    this.#roots = roots;
    this.#callback = callback;
  }
  connect() {
    this.#update();
    const observer = new MutationObserver(this.#onMutation);
    for (const root of this.#roots) observer.observe(root, { childList: true, subtree: true });
    onDispose(() => observer.disconnect());
    onDispose(this.disconnect.bind(this));
  }
  disconnect() {
    this.elements.clear();
  }
  assign(template, slot) {
    if (isDOMNode(template)) {
      slot.textContent = "";
      slot.append(template);
    } else {
      render(null, slot);
      render(template, slot);
    }
    if (!slot.style.display) {
      slot.style.display = "contents";
    }
    const el = slot.firstElementChild;
    if (!el) return;
    const classList = slot.getAttribute("data-class");
    if (classList) el.classList.add(...classList.split(" "));
  }
  #onMutation = animationFrameThrottle(this.#update.bind(this));
  #update(entries) {
    if (entries && !entries.some((e) => e.addedNodes.length)) return;
    let changed = false, slots = this.#roots.flatMap((root) => [...root.querySelectorAll("slot")]);
    for (const slot of slots) {
      if (!slot.hasAttribute("name") || this.elements.has(slot)) continue;
      this.elements.add(slot);
      changed = true;
    }
    if (changed) this.#callback(this.elements);
  }
}

let id$1 = 0, slotIdAttr = "data-slot-id";
class SlotManager {
  #roots;
  slots;
  constructor(roots) {
    this.#roots = roots;
    this.slots = new SlotObserver(roots, this.#update.bind(this));
  }
  connect() {
    this.slots.connect();
    this.#update();
    const mutations = new MutationObserver(this.#onMutation);
    for (const root of this.#roots) mutations.observe(root, { childList: true });
    onDispose(() => mutations.disconnect());
  }
  #onMutation = animationFrameThrottle(this.#update.bind(this));
  #update() {
    for (const root of this.#roots) {
      for (const node of root.children) {
        if (node.nodeType !== 1) continue;
        const name = node.getAttribute("slot");
        if (!name) continue;
        node.style.display = "none";
        let slotId = node.getAttribute(slotIdAttr);
        if (!slotId) {
          node.setAttribute(slotIdAttr, slotId = ++id$1 + "");
        }
        for (const slot of this.slots.elements) {
          if (slot.getAttribute("name") !== name || slot.getAttribute(slotIdAttr) === slotId) {
            continue;
          }
          const clone = document.importNode(node, true);
          if (name.includes("-icon")) clone.classList.add("vds-icon");
          clone.style.display = "";
          clone.removeAttribute("slot");
          this.slots.assign(clone, slot);
          slot.setAttribute(slotIdAttr, slotId);
        }
      }
    }
  }
}

const lastElementForContextAndCallback = /* @__PURE__ */ new WeakMap();
class RefDirective extends AsyncDirective {
  render(_ref) {
    return nothing;
  }
  update(part, [ref2]) {
    var _a;
    const refChanged = ref2 !== this._ref;
    if (refChanged && this._ref !== void 0) {
      this._updateRefValue(void 0);
    }
    if (refChanged || this._lastElementForRef !== this._element) {
      this._ref = ref2;
      this._context = (_a = part.options) === null || _a === void 0 ? void 0 : _a.host;
      this._updateRefValue(this._element = part.element);
    }
    return nothing;
  }
  _updateRefValue(element) {
    var _a;
    if (typeof this._ref === "function") {
      const context = (_a = this._context) !== null && _a !== void 0 ? _a : globalThis;
      let lastElementForCallback = lastElementForContextAndCallback.get(context);
      if (lastElementForCallback === void 0) {
        lastElementForCallback = /* @__PURE__ */ new WeakMap();
        lastElementForContextAndCallback.set(context, lastElementForCallback);
      }
      if (lastElementForCallback.get(this._ref) !== void 0) {
        this._ref.call(this._context, void 0);
      }
      lastElementForCallback.set(this._ref, element);
      if (element !== void 0) {
        this._ref.call(this._context, element);
      }
    } else {
      this._ref.value = element;
    }
  }
  get _lastElementForRef() {
    var _a, _b, _c;
    return typeof this._ref === "function" ? (_b = lastElementForContextAndCallback.get((_a = this._context) !== null && _a !== void 0 ? _a : globalThis)) === null || _b === void 0 ? void 0 : _b.get(this._ref) : (_c = this._ref) === null || _c === void 0 ? void 0 : _c.value;
  }
  disconnected() {
    if (this._lastElementForRef === this._element) {
      this._updateRefValue(void 0);
    }
  }
  reconnected() {
    this._updateRefValue(this._element);
  }
}
const ref = directive(RefDirective);

function i18n$1(translations, word) {
  return translations()?.[word] ?? word;
}

function DefaultAnnouncer() {
  return $signal(() => {
    const { translations, userPrefersAnnouncements } = useDefaultLayoutContext();
    if (!userPrefersAnnouncements()) return null;
    return html`<media-announcer .translations=${$signal(translations)}></media-announcer>`;
  });
}

function IconSlot(name, classes = "") {
  return html`<slot
    name=${`${name}-icon`}
    data-class=${`vds-icon vds-${name}-icon${classes ? ` ${classes}` : ""}`}
  ></slot>`;
}
function IconSlots(names) {
  return names.map((name) => IconSlot(name));
}

function $i18n$1(translations, word) {
  return $signal(() => i18n$1(translations, word));
}

function DefaultAirPlayButton({ tooltip }) {
  const { translations } = useDefaultLayoutContext(), { remotePlaybackState } = useMediaState(), $label = $signal(() => {
    const airPlayText = i18n$1(translations, "AirPlay"), stateText = uppercaseFirstChar(remotePlaybackState());
    return `${airPlayText} ${stateText}`;
  }), $airPlayText = $i18n$1(translations, "AirPlay");
  return html`
    <media-tooltip class="vds-airplay-tooltip vds-tooltip">
      <media-tooltip-trigger>
        <media-airplay-button class="vds-airplay-button vds-button" aria-label=${$label}>
          ${IconSlot("airplay")}
        </media-airplay-button>
      </media-tooltip-trigger>
      <media-tooltip-content class="vds-tooltip-content" placement=${tooltip}>
        <span class="vds-airplay-tooltip-text">${$airPlayText}</span>
      </media-tooltip-content>
    </media-tooltip>
  `;
}
function DefaultGoogleCastButton({ tooltip }) {
  const { translations } = useDefaultLayoutContext(), { remotePlaybackState } = useMediaState(), $label = $signal(() => {
    const googleCastText = i18n$1(translations, "Google Cast"), stateText = uppercaseFirstChar(remotePlaybackState());
    return `${googleCastText} ${stateText}`;
  }), $googleCastText = $i18n$1(translations, "Google Cast");
  return html`
    <media-tooltip class="vds-google-cast-tooltip vds-tooltip">
      <media-tooltip-trigger>
        <media-google-cast-button class="vds-google-cast-button vds-button" aria-label=${$label}>
          ${IconSlot("google-cast")}
        </media-google-cast-button>
      </media-tooltip-trigger>
      <media-tooltip-content class="vds-tooltip-content" placement=${tooltip}>
        <span class="vds-google-cast-tooltip-text">${$googleCastText}</span>
      </media-tooltip-content>
    </media-tooltip>
  `;
}
function DefaultPlayButton({ tooltip }) {
  const { translations } = useDefaultLayoutContext(), $playText = $i18n$1(translations, "Play"), $pauseText = $i18n$1(translations, "Pause");
  return html`
    <media-tooltip class="vds-play-tooltip vds-tooltip">
      <media-tooltip-trigger>
        <media-play-button
          class="vds-play-button vds-button"
          aria-label=${$i18n$1(translations, "Play")}
        >
          ${IconSlots(["play", "pause", "replay"])}
        </media-play-button>
      </media-tooltip-trigger>
      <media-tooltip-content class="vds-tooltip-content" placement=${tooltip}>
        <span class="vds-play-tooltip-text">${$playText}</span>
        <span class="vds-pause-tooltip-text">${$pauseText}</span>
      </media-tooltip-content>
    </media-tooltip>
  `;
}
function DefaultMuteButton({
  tooltip,
  ref: ref$1 = noop
}) {
  const { translations } = useDefaultLayoutContext(), $muteText = $i18n$1(translations, "Mute"), $unmuteText = $i18n$1(translations, "Unmute");
  return html`
    <media-tooltip class="vds-mute-tooltip vds-tooltip">
      <media-tooltip-trigger>
        <media-mute-button
          class="vds-mute-button vds-button"
          aria-label=${$i18n$1(translations, "Mute")}
          ${ref(ref$1)}
        >
          ${IconSlots(["mute", "volume-low", "volume-high"])}
        </media-mute-button>
      </media-tooltip-trigger>
      <media-tooltip-content class="vds-tooltip-content" placement=${tooltip}>
        <span class="vds-mute-tooltip-text">${$unmuteText}</span>
        <span class="vds-unmute-tooltip-text">${$muteText}</span>
      </media-tooltip-content>
    </media-tooltip>
  `;
}
function DefaultCaptionButton({ tooltip }) {
  const { translations } = useDefaultLayoutContext(), $ccOnText = $i18n$1(translations, "Closed-Captions On"), $ccOffText = $i18n$1(translations, "Closed-Captions Off");
  return html`
    <media-tooltip class="vds-caption-tooltip vds-tooltip">
      <media-tooltip-trigger>
        <media-caption-button
          class="vds-caption-button vds-button"
          aria-label=${$i18n$1(translations, "Captions")}
        >
          ${IconSlots(["cc-on", "cc-off"])}
        </media-caption-button>
      </media-tooltip-trigger>
      <media-tooltip-content class="vds-tooltip-content" placement=${tooltip}>
        <span class="vds-cc-on-tooltip-text">${$ccOffText}</span>
        <span class="vds-cc-off-tooltip-text">${$ccOnText}</span>
      </media-tooltip-content>
    </media-tooltip>
  `;
}
function DefaultPIPButton() {
  const { translations } = useDefaultLayoutContext(), $enterText = $i18n$1(translations, "Enter PiP"), $exitText = $i18n$1(translations, "Exit PiP");
  return html`
    <media-tooltip class="vds-pip-tooltip vds-tooltip">
      <media-tooltip-trigger>
        <media-pip-button
          class="vds-pip-button vds-button"
          aria-label=${$i18n$1(translations, "PiP")}
        >
          ${IconSlots(["pip-enter", "pip-exit"])}
        </media-pip-button>
      </media-tooltip-trigger>
      <media-tooltip-content class="vds-tooltip-content">
        <span class="vds-pip-enter-tooltip-text">${$enterText}</span>
        <span class="vds-pip-exit-tooltip-text">${$exitText}</span>
      </media-tooltip-content>
    </media-tooltip>
  `;
}
function DefaultFullscreenButton({ tooltip }) {
  const { translations } = useDefaultLayoutContext(), $enterText = $i18n$1(translations, "Enter Fullscreen"), $exitText = $i18n$1(translations, "Exit Fullscreen");
  return html`
    <media-tooltip class="vds-fullscreen-tooltip vds-tooltip">
      <media-tooltip-trigger>
        <media-fullscreen-button
          class="vds-fullscreen-button vds-button"
          aria-label=${$i18n$1(translations, "Fullscreen")}
        >
          ${IconSlots(["fs-enter", "fs-exit"])}
        </media-fullscreen-button>
      </media-tooltip-trigger>
      <media-tooltip-content class="vds-tooltip-content" placement=${tooltip}>
        <span class="vds-fs-enter-tooltip-text">${$enterText}</span>
        <span class="vds-fs-exit-tooltip-text">${$exitText}</span>
      </media-tooltip-content>
    </media-tooltip>
  `;
}
function DefaultSeekButton({
  backward,
  tooltip
}) {
  const { translations, seekStep } = useDefaultLayoutContext(), seekText = !backward ? "Seek Forward" : "Seek Backward", $label = $i18n$1(translations, seekText), $seconds = () => (backward ? -1 : 1) * seekStep();
  return html`
    <media-tooltip class="vds-seek-tooltip vds-tooltip">
      <media-tooltip-trigger>
        <media-seek-button
          class="vds-seek-button vds-button"
          seconds=${$signal($seconds)}
          aria-label=${$label}
        >
          ${!backward ? IconSlot("seek-forward") : IconSlot("seek-backward")}
        </media-seek-button>
      </media-tooltip-trigger>
      <media-tooltip-content class="vds-tooltip-content" placement=${tooltip}>
        ${$i18n$1(translations, seekText)}
      </media-tooltip-content>
    </media-tooltip>
  `;
}
function DefaultLiveButton() {
  const { translations } = useDefaultLayoutContext(), { live } = useMediaState(), $label = $i18n$1(translations, "Skip To Live"), $liveText = $i18n$1(translations, "LIVE");
  return live() ? html`
        <media-live-button class="vds-live-button" aria-label=${$label}>
          <span class="vds-live-button-text">${$liveText}</span>
        </media-live-button>
      ` : null;
}
function DefaultDownloadButton() {
  return $signal(() => {
    const { download, translations } = useDefaultLayoutContext(), $download = download();
    if (isNil($download)) return null;
    const { source, title } = useMediaState(), $src = source(), file = getDownloadFile({
      title: title(),
      src: $src,
      download: $download
    });
    return isString(file?.url) ? html`
          <media-tooltip class="vds-download-tooltip vds-tooltip">
            <media-tooltip-trigger>
              <a
                role="button"
                class="vds-download-button vds-button"
                aria-label=${$i18n$1(translations, "Download")}
                href=${appendParamsToURL(file.url, { download: file.name })}
                download=${file.name}
                target="_blank"
              >
                <slot name="download-icon" data-class="vds-icon" />
              </a>
            </media-tooltip-trigger>
            <media-tooltip-content class="vds-tooltip-content" placement="top">
              ${$i18n$1(translations, "Download")}
            </media-tooltip-content>
          </media-tooltip>
        ` : null;
  });
}

function DefaultCaptions() {
  const { translations } = useDefaultLayoutContext();
  return html`
    <media-captions
      class="vds-captions"
      .exampleText=${$i18n$1(translations, "Captions look like this")}
    ></media-captions>
  `;
}

function DefaultControlsSpacer() {
  return html`<div class="vds-controls-spacer"></div>`;
}

function MenuPortal$1(container, template) {
  return html`
    <media-menu-portal .container=${$signal(container)} disabled="fullscreen">
      ${template}
    </media-menu-portal>
  `;
}
function createMenuContainer(layoutEl, rootSelector, className, isSmallLayout) {
  let root = isString(rootSelector) ? document.querySelector(rootSelector) : rootSelector;
  if (!root) root = layoutEl?.closest("dialog");
  if (!root) root = document.body;
  const container = document.createElement("div");
  container.style.display = "contents";
  container.classList.add(className);
  root.append(container);
  effect(() => {
    if (!container) return;
    const { viewType } = useMediaState(), isSmall = isSmallLayout();
    setAttribute(container, "data-view-type", viewType());
    setAttribute(container, "data-sm", isSmall);
    setAttribute(container, "data-lg", !isSmall);
    setAttribute(container, "data-size", isSmall ? "sm" : "lg");
  });
  const { colorScheme } = useDefaultLayoutContext();
  watchColorScheme(container, colorScheme);
  return container;
}

function DefaultChaptersMenu({
  placement,
  tooltip,
  portal
}) {
  const { textTracks } = useMediaContext(), { viewType, seekableStart, seekableEnd } = useMediaState(), {
    translations,
    thumbnails,
    menuPortal,
    noModal,
    menuGroup,
    smallWhen: smWhen
  } = useDefaultLayoutContext(), $disabled = computed(() => {
    const $startTime = seekableStart(), $endTime = seekableEnd(), $track = signal(null);
    watchActiveTextTrack(textTracks, "chapters", $track.set);
    const cues = $track()?.cues.filter(
      (cue) => cue.startTime <= $endTime && cue.endTime >= $startTime
    );
    return !cues?.length;
  });
  if ($disabled()) return null;
  const $placement = computed(
    () => noModal() ? unwrap(placement) : !smWhen() ? unwrap(placement) : null
  ), $offset = computed(
    () => !smWhen() && menuGroup() === "bottom" && viewType() === "video" ? 26 : 0
  ), $isOpen = signal(false);
  function onOpen() {
    $isOpen.set(true);
  }
  function onClose() {
    $isOpen.set(false);
  }
  const items = html`
    <media-menu-items
      class="vds-chapters-menu-items vds-menu-items"
      placement=${$signal($placement)}
      offset=${$signal($offset)}
    >
      ${$signal(() => {
    if (!$isOpen()) return null;
    return html`
          <media-chapters-radio-group
            class="vds-chapters-radio-group vds-radio-group"
            .thumbnails=${$signal(thumbnails)}
          >
            <template>
              <media-radio class="vds-chapter-radio vds-radio">
                <media-thumbnail class="vds-thumbnail"></media-thumbnail>
                <div class="vds-chapter-radio-content">
                  <span class="vds-chapter-radio-label" data-part="label"></span>
                  <span class="vds-chapter-radio-start-time" data-part="start-time"></span>
                  <span class="vds-chapter-radio-duration" data-part="duration"></span>
                </div>
              </media-radio>
            </template>
          </media-chapters-radio-group>
        `;
  })}
    </media-menu-items>
  `;
  return html`
    <media-menu class="vds-chapters-menu vds-menu" @open=${onOpen} @close=${onClose}>
      <media-tooltip class="vds-tooltip">
        <media-tooltip-trigger>
          <media-menu-button
            class="vds-menu-button vds-button"
            aria-label=${$i18n$1(translations, "Chapters")}
          >
            ${IconSlot("menu-chapters")}
          </media-menu-button>
        </media-tooltip-trigger>
        <media-tooltip-content
          class="vds-tooltip-content"
          placement=${isFunction(tooltip) ? $signal(tooltip) : tooltip}
        >
          ${$i18n$1(translations, "Chapters")}
        </media-tooltip-content>
      </media-tooltip>
      ${portal ? MenuPortal$1(menuPortal, items) : items}
    </media-menu>
  `;
}

function hexToRgb(hex) {
  const { style } = new Option();
  style.color = hex;
  return style.color.match(/\((.*?)\)/)[1].replace(/,/g, " ");
}

const FONT_COLOR_OPTION = {
  type: "color"
};
const FONT_FAMILY_OPTION = {
  type: "radio",
  values: {
    "Monospaced Serif": "mono-serif",
    "Proportional Serif": "pro-serif",
    "Monospaced Sans-Serif": "mono-sans",
    "Proportional Sans-Serif": "pro-sans",
    Casual: "casual",
    Cursive: "cursive",
    "Small Capitals": "capitals"
  }
};
const FONT_SIZE_OPTION = {
  type: "slider",
  min: 0,
  max: 400,
  step: 25,
  upIcon: null,
  downIcon: null
};
const FONT_OPACITY_OPTION = {
  type: "slider",
  min: 0,
  max: 100,
  step: 5,
  upIcon: null,
  downIcon: null
};
const FONT_TEXT_SHADOW_OPTION = {
  type: "radio",
  values: ["None", "Drop Shadow", "Raised", "Depressed", "Outline"]
};
const FONT_DEFAULTS = {
  fontFamily: "pro-sans",
  fontSize: "100%",
  textColor: "#ffffff",
  textOpacity: "100%",
  textShadow: "none",
  textBg: "#000000",
  textBgOpacity: "100%",
  displayBg: "#000000",
  displayBgOpacity: "0%"
};
const FONT_SIGNALS = Object.keys(FONT_DEFAULTS).reduce(
  (prev, type) => ({
    ...prev,
    [type]: signal(FONT_DEFAULTS[type])
  }),
  {}
);
{
  for (const type of Object.keys(FONT_SIGNALS)) {
    const value = localStorage.getItem(`vds-player:${camelToKebabCase(type)}`);
    if (isString(value)) FONT_SIGNALS[type].set(value);
  }
}
function onFontReset() {
  for (const type of Object.keys(FONT_SIGNALS)) {
    const defaultValue = FONT_DEFAULTS[type];
    FONT_SIGNALS[type].set(defaultValue);
  }
}

let isWatchingVars = false, players = /* @__PURE__ */ new Set();
function updateFontCssVars() {
  const { player } = useMediaContext();
  players.add(player);
  onDispose(() => players.delete(player));
  if (!isWatchingVars) {
    scoped(() => {
      for (const type of keysOf(FONT_SIGNALS)) {
        const $value = FONT_SIGNALS[type], defaultValue = FONT_DEFAULTS[type], varName = `--media-user-${camelToKebabCase(type)}`, storageKey = `vds-player:${camelToKebabCase(type)}`;
        effect(() => {
          const value = $value(), isDefaultVarValue = value === defaultValue, varValue = !isDefaultVarValue ? getCssVarValue(player, type, value) : null;
          for (const player2 of players) {
            player2.el?.style.setProperty(varName, varValue);
          }
          if (isDefaultVarValue) {
            localStorage.removeItem(storageKey);
          } else {
            localStorage.setItem(storageKey, value);
          }
        });
      }
    }, null);
    isWatchingVars = true;
  }
}
function getCssVarValue(player, type, value) {
  switch (type) {
    case "fontFamily":
      const fontVariant = value === "capitals" ? "small-caps" : "";
      player.el?.style.setProperty("--media-user-font-variant", fontVariant);
      return getFontFamilyCSSVarValue(value);
    case "fontSize":
    case "textOpacity":
    case "textBgOpacity":
    case "displayBgOpacity":
      return percentToRatio(value);
    case "textColor":
      return `rgb(${hexToRgb(value)} / var(--media-user-text-opacity, 1))`;
    case "textShadow":
      return getTextShadowCssVarValue(value);
    case "textBg":
      return `rgb(${hexToRgb(value)} / var(--media-user-text-bg-opacity, 1))`;
    case "displayBg":
      return `rgb(${hexToRgb(value)} / var(--media-user-display-bg-opacity, 1))`;
  }
}
function percentToRatio(value) {
  return (parseInt(value) / 100).toString();
}
function getFontFamilyCSSVarValue(value) {
  switch (value) {
    case "mono-serif":
      return '"Courier New", Courier, "Nimbus Mono L", "Cutive Mono", monospace';
    case "mono-sans":
      return '"Deja Vu Sans Mono", "Lucida Console", Monaco, Consolas, "PT Mono", monospace';
    case "pro-sans":
      return 'Roboto, "Arial Unicode Ms", Arial, Helvetica, Verdana, "PT Sans Caption", sans-serif';
    case "casual":
      return '"Comic Sans MS", Impact, Handlee, fantasy';
    case "cursive":
      return '"Monotype Corsiva", "URW Chancery L", "Apple Chancery", "Dancing Script", cursive';
    case "capitals":
      return '"Arial Unicode Ms", Arial, Helvetica, Verdana, "Marcellus SC", sans-serif + font-variant=small-caps';
    default:
      return '"Times New Roman", Times, Georgia, Cambria, "PT Serif Caption", serif';
  }
}
function getTextShadowCssVarValue(value) {
  switch (value) {
    case "drop shadow":
      return "rgb(34, 34, 34) 1.86389px 1.86389px 2.79583px, rgb(34, 34, 34) 1.86389px 1.86389px 3.72778px, rgb(34, 34, 34) 1.86389px 1.86389px 4.65972px";
    case "raised":
      return "rgb(34, 34, 34) 1px 1px, rgb(34, 34, 34) 2px 2px";
    case "depressed":
      return "rgb(204, 204, 204) 1px 1px, rgb(34, 34, 34) -1px -1px";
    case "outline":
      return "rgb(34, 34, 34) 0px 0px 1.86389px, rgb(34, 34, 34) 0px 0px 1.86389px, rgb(34, 34, 34) 0px 0px 1.86389px, rgb(34, 34, 34) 0px 0px 1.86389px, rgb(34, 34, 34) 0px 0px 1.86389px";
    default:
      return "";
  }
}

let sectionId = 0;
function DefaultMenuSection({ label = "", value = "", children }) {
  if (!label) {
    return html`
      <div class="vds-menu-section">
        <div class="vds-menu-section-body">${children}</div>
      </div>
    `;
  }
  const id = `vds-menu-section-${++sectionId}`;
  return html`
    <section class="vds-menu-section" role="group" aria-labelledby=${id}>
      <div class="vds-menu-section-title">
        <header id=${id}>${label}</header>
        ${value ? html`<div class="vds-menu-section-value">${value}</div>` : null}
      </div>
      <div class="vds-menu-section-body">${children}</div>
    </section>
  `;
}
function DefaultMenuItem({ label, children }) {
  return html`
    <div class="vds-menu-item">
      <div class="vds-menu-item-label">${label}</div>
      ${children}
    </div>
  `;
}
function DefaultMenuButton({
  label,
  icon,
  hint
}) {
  return html`
    <media-menu-button class="vds-menu-item">
      ${IconSlot("menu-arrow-left", "vds-menu-close-icon")}
      ${icon ? IconSlot(icon, "vds-menu-item-icon") : null}
      <span class="vds-menu-item-label">${$signal(label)}</span>
      <span class="vds-menu-item-hint" data-part="hint">${hint ? $signal(hint) : null} </span>
      ${IconSlot("menu-arrow-right", "vds-menu-open-icon")}
    </media-menu-button>
  `;
}
function DefaultRadioGroup({
  value = null,
  options,
  hideLabel = false,
  children = null,
  onChange = null
}) {
  function renderRadio(option) {
    const { value: value2, label: content } = option;
    return html`
      <media-radio class="vds-radio" value=${value2}>
        ${IconSlot("menu-radio-check")}
        ${!hideLabel ? html`
              <span class="vds-radio-label" data-part="label">
                ${isString(content) ? content : $signal(content)}
              </span>
            ` : null}
        ${isFunction(children) ? children(option) : children}
      </media-radio>
    `;
  }
  return html`
    <media-radio-group
      class="vds-radio-group"
      value=${isString(value) ? value : value ? $signal(value) : ""}
      @change=${onChange}
    >
      ${isArray$1(options) ? options.map(renderRadio) : $signal(() => options().map(renderRadio))}
    </media-radio-group>
  `;
}
function createRadioOptions(entries) {
  return isArray$1(entries) ? entries.map((entry) => ({ label: entry, value: entry.toLowerCase() })) : Object.keys(entries).map((label) => ({ label, value: entries[label] }));
}

function DefaultSliderParts() {
  return html`
    <div class="vds-slider-track"></div>
    <div class="vds-slider-track-fill vds-slider-track"></div>
    <div class="vds-slider-thumb"></div>
  `;
}
function DefaultSliderSteps() {
  return html`
    <media-slider-steps class="vds-slider-steps">
      <template>
        <div class="vds-slider-step"></div>
      </template>
    </media-slider-steps>
  `;
}
function DefaultMenuSliderItem({
  label = null,
  value = null,
  upIcon = "",
  downIcon = "",
  children,
  isMin,
  isMax
}) {
  const hasTitle = label || value, content = [
    downIcon ? IconSlot(downIcon, "down") : null,
    children,
    upIcon ? IconSlot(upIcon, "up") : null
  ];
  return html`
    <div
      class=${`vds-menu-item vds-menu-slider-item${hasTitle ? " group" : ""}`}
      data-min=${$signal(() => isMin() ? "" : null)}
      data-max=${$signal(() => isMax() ? "" : null)}
    >
      ${hasTitle ? html`
            <div class="vds-menu-slider-title">
              ${[
    label ? html`<div>${label}</div>` : null,
    value ? html`<div>${value}</div>` : null
  ]}
            </div>
            <div class="vds-menu-slider-body">${content}</div>
          ` : content}
    </div>
  `;
}

const FONT_SIZE_OPTION_WITH_ICONS = {
  ...FONT_SIZE_OPTION,
  upIcon: "menu-opacity-up",
  downIcon: "menu-opacity-down"
};
const FONT_OPACITY_OPTION_WITH_ICONS = {
  ...FONT_OPACITY_OPTION,
  upIcon: "menu-opacity-up",
  downIcon: "menu-opacity-down"
};
function DefaultFontMenu() {
  return $signal(() => {
    const { hasCaptions } = useMediaState(), { translations } = useDefaultLayoutContext();
    if (!hasCaptions()) return null;
    return html`
      <media-menu class="vds-font-menu vds-menu">
        ${DefaultMenuButton({
      label: () => i18n$1(translations, "Caption Styles")
    })}
        <media-menu-items class="vds-menu-items">
          ${[
      DefaultMenuSection({
        label: $i18n$1(translations, "Font"),
        children: [DefaultFontFamilyMenu(), DefaultFontSizeSlider()]
      }),
      DefaultMenuSection({
        label: $i18n$1(translations, "Text"),
        children: [
          DefaultTextColorInput(),
          DefaultTextShadowMenu(),
          DefaultTextOpacitySlider()
        ]
      }),
      DefaultMenuSection({
        label: $i18n$1(translations, "Text Background"),
        children: [DefaultTextBgInput(), DefaultTextBgOpacitySlider()]
      }),
      DefaultMenuSection({
        label: $i18n$1(translations, "Display Background"),
        children: [DefaultDisplayBgInput(), DefaultDisplayOpacitySlider()]
      }),
      DefaultMenuSection({
        children: [DefaultResetMenuItem()]
      })
    ]}
        </media-menu-items>
      </media-menu>
    `;
  });
}
function DefaultFontFamilyMenu() {
  return DefaultFontSetting({
    label: "Family",
    option: FONT_FAMILY_OPTION,
    type: "fontFamily"
  });
}
function DefaultFontSizeSlider() {
  return DefaultFontSetting({
    label: "Size",
    option: FONT_SIZE_OPTION_WITH_ICONS,
    type: "fontSize"
  });
}
function DefaultTextColorInput() {
  return DefaultFontSetting({
    label: "Color",
    option: FONT_COLOR_OPTION,
    type: "textColor"
  });
}
function DefaultTextOpacitySlider() {
  return DefaultFontSetting({
    label: "Opacity",
    option: FONT_OPACITY_OPTION_WITH_ICONS,
    type: "textOpacity"
  });
}
function DefaultTextShadowMenu() {
  return DefaultFontSetting({
    label: "Shadow",
    option: FONT_TEXT_SHADOW_OPTION,
    type: "textShadow"
  });
}
function DefaultTextBgInput() {
  return DefaultFontSetting({
    label: "Color",
    option: FONT_COLOR_OPTION,
    type: "textBg"
  });
}
function DefaultTextBgOpacitySlider() {
  return DefaultFontSetting({
    label: "Opacity",
    option: FONT_OPACITY_OPTION_WITH_ICONS,
    type: "textBgOpacity"
  });
}
function DefaultDisplayBgInput() {
  return DefaultFontSetting({
    label: "Color",
    option: FONT_COLOR_OPTION,
    type: "displayBg"
  });
}
function DefaultDisplayOpacitySlider() {
  return DefaultFontSetting({
    label: "Opacity",
    option: FONT_OPACITY_OPTION_WITH_ICONS,
    type: "displayBgOpacity"
  });
}
function DefaultResetMenuItem() {
  const { translations } = useDefaultLayoutContext(), $label = () => i18n$1(translations, "Reset");
  return html`
    <button class="vds-menu-item" role="menuitem" @click=${onFontReset}>
      <span class="vds-menu-item-label">${$signal($label)}</span>
    </button>
  `;
}
function DefaultFontSetting({ label, option, type }) {
  const { player } = useMediaContext(), { translations } = useDefaultLayoutContext(), $currentValue = FONT_SIGNALS[type], $label = () => i18n$1(translations, label);
  function notify() {
    tick();
    player.dispatchEvent(new Event("vds-font-change"));
  }
  if (option.type === "color") {
    let onColorChange2 = function(event) {
      $currentValue.set(event.target.value);
      notify();
    };
    return DefaultMenuItem({
      label: $signal($label),
      children: html`
        <input
          class="vds-color-picker"
          type="color"
          .value=${$signal($currentValue)}
          @input=${onColorChange2}
        />
      `
    });
  }
  if (option.type === "slider") {
    let onSliderValueChange2 = function(event) {
      $currentValue.set(event.detail + "%");
      notify();
    };
    const { min, max, step, upIcon, downIcon } = option;
    return DefaultMenuSliderItem({
      label: $signal($label),
      value: $signal($currentValue),
      upIcon,
      downIcon,
      isMin: () => $currentValue() === min + "%",
      isMax: () => $currentValue() === max + "%",
      children: html`
        <media-slider
          class="vds-slider"
          min=${min}
          max=${max}
          step=${step}
          key-step=${step}
          .value=${$signal(() => parseInt($currentValue()))}
          aria-label=${$signal($label)}
          @value-change=${onSliderValueChange2}
          @drag-value-change=${onSliderValueChange2}
        >
          ${DefaultSliderParts()}${DefaultSliderSteps()}
        </media-slider>
      `
    });
  }
  const radioOptions = createRadioOptions(option.values), $hint = () => {
    const value = $currentValue(), label2 = radioOptions.find((radio) => radio.value === value)?.label || "";
    return i18n$1(translations, isString(label2) ? label2 : label2());
  };
  return html`
    <media-menu class=${`vds-${camelToKebabCase(type)}-menu vds-menu`}>
      ${DefaultMenuButton({ label: $label, hint: $hint })}
      <media-menu-items class="vds-menu-items">
        ${DefaultRadioGroup({
    value: $currentValue,
    options: radioOptions,
    onChange({ detail: value }) {
      $currentValue.set(value);
      notify();
    }
  })}
      </media-menu-items>
    </media-menu>
  `;
}

function ariaBool(value) {
  return value ? "true" : "false";
}
function $ariaBool(signal) {
  return () => ariaBool(signal());
}

function DefaultMenuCheckbox({
  label,
  checked,
  defaultChecked = false,
  storageKey,
  onChange
}) {
  const { translations } = useDefaultLayoutContext(), savedValue = storageKey ? localStorage.getItem(storageKey) : null, $checked = signal(!!(savedValue ?? defaultChecked)), $active = signal(false), $ariaChecked = $signal($ariaBool($checked)), $label = $i18n$1(translations, label);
  if (storageKey) onChange(peek($checked));
  if (checked) {
    effect(() => void $checked.set(checked()));
  }
  function onPress(event) {
    if (event?.button === 1) return;
    $checked.set((checked2) => !checked2);
    if (storageKey) localStorage.setItem(storageKey, $checked() ? "1" : "");
    onChange($checked(), event);
    $active.set(false);
  }
  function onKeyDown(event) {
    if (isKeyboardClick(event)) onPress();
  }
  function onActive(event) {
    if (event.button !== 0) return;
    $active.set(true);
  }
  return html`
    <div
      class="vds-menu-checkbox"
      role="menuitemcheckbox"
      tabindex="0"
      aria-label=${$label}
      aria-checked=${$ariaChecked}
      data-active=${$signal(() => $active() ? "" : null)}
      @pointerup=${onPress}
      @pointerdown=${onActive}
      @keydown=${onKeyDown}
    ></div>
  `;
}

function DefaultAccessibilityMenu() {
  return $signal(() => {
    const { translations } = useDefaultLayoutContext();
    return html`
      <media-menu class="vds-accessibility-menu vds-menu">
        ${DefaultMenuButton({
      label: () => i18n$1(translations, "Accessibility"),
      icon: "menu-accessibility"
    })}
        <media-menu-items class="vds-menu-items">
          ${[
      DefaultMenuSection({
        children: [
          DefaultAnnouncementsMenuCheckbox(),
          DefaultKeyboardAnimationsMenuCheckbox()
        ]
      }),
      DefaultMenuSection({
        children: [DefaultFontMenu()]
      })
    ]}
        </media-menu-items>
      </media-menu>
    `;
  });
}
function DefaultAnnouncementsMenuCheckbox() {
  const { userPrefersAnnouncements, translations } = useDefaultLayoutContext(), label = "Announcements";
  return DefaultMenuItem({
    label: $i18n$1(translations, label),
    children: DefaultMenuCheckbox({
      label,
      storageKey: "vds-player::announcements",
      onChange(checked) {
        userPrefersAnnouncements.set(checked);
      }
    })
  });
}
function DefaultKeyboardAnimationsMenuCheckbox() {
  return $signal(() => {
    const { translations, userPrefersKeyboardAnimations, noKeyboardAnimations } = useDefaultLayoutContext(), { viewType } = useMediaState(), $disabled = computed(() => viewType() !== "video" || noKeyboardAnimations());
    if ($disabled()) return null;
    const label = "Keyboard Animations";
    return DefaultMenuItem({
      label: $i18n$1(translations, label),
      children: DefaultMenuCheckbox({
        label,
        defaultChecked: true,
        storageKey: "vds-player::keyboard-animations",
        onChange(checked) {
          userPrefersKeyboardAnimations.set(checked);
        }
      })
    });
  });
}

function DefaultAudioMenu() {
  return $signal(() => {
    const { noAudioGain, translations } = useDefaultLayoutContext(), { audioTracks, canSetAudioGain } = useMediaState(), $disabled = computed(() => {
      const hasGainSlider = canSetAudioGain() && !noAudioGain();
      return !hasGainSlider && audioTracks().length <= 1;
    });
    if ($disabled()) return null;
    return html`
      <media-menu class="vds-audio-menu vds-menu">
        ${DefaultMenuButton({
      label: () => i18n$1(translations, "Audio"),
      icon: "menu-audio"
    })}
        <media-menu-items class="vds-menu-items">
          ${[DefaultAudioTracksMenu(), DefaultAudioBoostSection()]}
        </media-menu-items>
      </media-menu>
    `;
  });
}
function DefaultAudioTracksMenu() {
  return $signal(() => {
    const { translations } = useDefaultLayoutContext(), { audioTracks } = useMediaState(), $defaultText = $i18n$1(translations, "Default"), $disabled = computed(() => audioTracks().length <= 1);
    if ($disabled()) return null;
    return DefaultMenuSection({
      children: html`
        <media-menu class="vds-audio-tracks-menu vds-menu">
          ${DefaultMenuButton({
        label: () => i18n$1(translations, "Track")
      })}
          <media-menu-items class="vds-menu-items">
            <media-audio-radio-group
              class="vds-audio-track-radio-group vds-radio-group"
              empty-label=${$defaultText}
            >
              <template>
                <media-radio class="vds-audio-track-radio vds-radio">
                  <slot name="menu-radio-check-icon" data-class="vds-icon"></slot>
                  <span class="vds-radio-label" data-part="label"></span>
                </media-radio>
              </template>
            </media-audio-radio-group>
          </media-menu-items>
        </media-menu>
      `
    });
  });
}
function DefaultAudioBoostSection() {
  return $signal(() => {
    const { noAudioGain, translations } = useDefaultLayoutContext(), { canSetAudioGain } = useMediaState(), $disabled = computed(() => !canSetAudioGain() || noAudioGain());
    if ($disabled()) return null;
    const { audioGain } = useMediaState();
    return DefaultMenuSection({
      label: $i18n$1(translations, "Boost"),
      value: $signal(() => Math.round(((audioGain() ?? 1) - 1) * 100) + "%"),
      children: [
        DefaultMenuSliderItem({
          upIcon: "menu-audio-boost-up",
          downIcon: "menu-audio-boost-down",
          children: DefaultAudioGainSlider(),
          isMin: () => ((audioGain() ?? 1) - 1) * 100 <= getGainMin(),
          isMax: () => ((audioGain() ?? 1) - 1) * 100 === getGainMax()
        })
      ]
    });
  });
}
function DefaultAudioGainSlider() {
  const { translations } = useDefaultLayoutContext(), $label = $i18n$1(translations, "Boost"), $min = getGainMin, $max = getGainMax, $step = getGainStep;
  return html`
    <media-audio-gain-slider
      class="vds-audio-gain-slider vds-slider"
      aria-label=${$label}
      min=${$signal($min)}
      max=${$signal($max)}
      step=${$signal($step)}
      key-step=${$signal($step)}
    >
      ${DefaultSliderParts()}${DefaultSliderSteps()}
    </media-audio-gain-slider>
  `;
}
function getGainMin() {
  const { audioGains } = useDefaultLayoutContext(), gains = audioGains();
  return isArray$1(gains) ? gains[0] ?? 0 : gains.min;
}
function getGainMax() {
  const { audioGains } = useDefaultLayoutContext(), gains = audioGains();
  return isArray$1(gains) ? gains[gains.length - 1] ?? 300 : gains.max;
}
function getGainStep() {
  const { audioGains } = useDefaultLayoutContext(), gains = audioGains();
  return isArray$1(gains) ? gains[1] - gains[0] || 25 : gains.step;
}

function DefaultCaptionsMenu() {
  return $signal(() => {
    const { translations } = useDefaultLayoutContext(), { hasCaptions } = useMediaState(), $offText = $i18n$1(translations, "Off");
    if (!hasCaptions()) return null;
    return html`
      <media-menu class="vds-captions-menu vds-menu">
        ${DefaultMenuButton({
      label: () => i18n$1(translations, "Captions"),
      icon: "menu-captions"
    })}
        <media-menu-items class="vds-menu-items">
          <media-captions-radio-group
            class="vds-captions-radio-group vds-radio-group"
            off-label=${$offText}
          >
            <template>
              <media-radio class="vds-caption-radio vds-radio">
                <slot name="menu-radio-check-icon" data-class="vds-icon"></slot>
                <span class="vds-radio-label" data-part="label"></span>
              </media-radio>
            </template>
          </media-captions-radio-group>
        </media-menu-items>
      </media-menu>
    `;
  });
}

function sortVideoQualities(qualities, desc) {
  return [...qualities].sort(desc ? compareVideoQualityDesc : compareVideoQualityAsc);
}
function compareVideoQualityAsc(a, b) {
  return a.height === b.height ? (a.bitrate ?? 0) - (b.bitrate ?? 0) : a.height - b.height;
}
function compareVideoQualityDesc(a, b) {
  return b.height === a.height ? (b.bitrate ?? 0) - (a.bitrate ?? 0) : b.height - a.height;
}

function DefaultPlaybackMenu() {
  return $signal(() => {
    const { translations } = useDefaultLayoutContext();
    return html`
      <media-menu class="vds-playback-menu vds-menu">
        ${DefaultMenuButton({
      label: () => i18n$1(translations, "Playback"),
      icon: "menu-playback"
    })}
        <media-menu-items class="vds-menu-items">
          ${[
      DefaultMenuSection({
        children: DefaultLoopCheckbox()
      }),
      DefaultSpeedMenuSection(),
      DefaultQualityMenuSection()
    ]}
        </media-menu-items>
      </media-menu>
    `;
  });
}
function DefaultLoopCheckbox() {
  const { remote } = useMediaContext(), { translations } = useDefaultLayoutContext(), label = "Loop";
  return DefaultMenuItem({
    label: $i18n$1(translations, label),
    children: DefaultMenuCheckbox({
      label,
      storageKey: "vds-player::user-loop",
      onChange(checked, trigger) {
        remote.userPrefersLoopChange(checked, trigger);
      }
    })
  });
}
function DefaultSpeedMenuSection() {
  return $signal(() => {
    const { translations } = useDefaultLayoutContext(), { canSetPlaybackRate, playbackRate } = useMediaState();
    if (!canSetPlaybackRate()) return null;
    return DefaultMenuSection({
      label: $i18n$1(translations, "Speed"),
      value: $signal(
        () => playbackRate() === 1 ? i18n$1(translations, "Normal") : playbackRate() + "x"
      ),
      children: [
        DefaultMenuSliderItem({
          upIcon: "menu-speed-up",
          downIcon: "menu-speed-down",
          children: DefaultSpeedSlider(),
          isMin: () => playbackRate() === getSpeedMin(),
          isMax: () => playbackRate() === getSpeedMax()
        })
      ]
    });
  });
}
function getSpeedMin() {
  const { playbackRates } = useDefaultLayoutContext(), rates = playbackRates();
  return isArray$1(rates) ? rates[0] ?? 0 : rates.min;
}
function getSpeedMax() {
  const { playbackRates } = useDefaultLayoutContext(), rates = playbackRates();
  return isArray$1(rates) ? rates[rates.length - 1] ?? 2 : rates.max;
}
function getSpeedStep() {
  const { playbackRates } = useDefaultLayoutContext(), rates = playbackRates();
  return isArray$1(rates) ? rates[1] - rates[0] || 0.25 : rates.step;
}
function DefaultSpeedSlider() {
  const { translations } = useDefaultLayoutContext(), $label = $i18n$1(translations, "Speed"), $min = getSpeedMin, $max = getSpeedMax, $step = getSpeedStep;
  return html`
    <media-speed-slider
      class="vds-speed-slider vds-slider"
      aria-label=${$label}
      min=${$signal($min)}
      max=${$signal($max)}
      step=${$signal($step)}
      key-step=${$signal($step)}
    >
      ${DefaultSliderParts()}${DefaultSliderSteps()}
    </media-speed-slider>
  `;
}
function DefaultAutoQualityCheckbox() {
  const { remote, qualities } = useMediaContext(), { autoQuality, canSetQuality, qualities: $qualities } = useMediaState(), { translations } = useDefaultLayoutContext(), label = "Auto", $disabled = computed(() => !canSetQuality() || $qualities().length <= 1);
  if ($disabled()) return null;
  return DefaultMenuItem({
    label: $i18n$1(translations, label),
    children: DefaultMenuCheckbox({
      label,
      checked: autoQuality,
      onChange(checked, trigger) {
        if (checked) {
          remote.requestAutoQuality(trigger);
        } else {
          remote.changeQuality(qualities.selectedIndex, trigger);
        }
      }
    })
  });
}
function DefaultQualityMenuSection() {
  return $signal(() => {
    const { hideQualityBitrate, translations } = useDefaultLayoutContext(), { canSetQuality, qualities, quality } = useMediaState(), $disabled = computed(() => !canSetQuality() || qualities().length <= 1), $sortedQualities = computed(() => sortVideoQualities(qualities()));
    if ($disabled()) return null;
    return DefaultMenuSection({
      label: $i18n$1(translations, "Quality"),
      value: $signal(() => {
        const height = quality()?.height, bitrate = !hideQualityBitrate() ? quality()?.bitrate : null, bitrateText = bitrate && bitrate > 0 ? `${(bitrate / 1e6).toFixed(2)} Mbps` : null, autoText = i18n$1(translations, "Auto");
        return height ? `${height}p${bitrateText ? ` (${bitrateText})` : ""}` : autoText;
      }),
      children: [
        DefaultMenuSliderItem({
          upIcon: "menu-quality-up",
          downIcon: "menu-quality-down",
          children: DefaultQualitySlider(),
          isMin: () => $sortedQualities()[0] === quality(),
          isMax: () => $sortedQualities().at(-1) === quality()
        }),
        DefaultAutoQualityCheckbox()
      ]
    });
  });
}
function DefaultQualitySlider() {
  const { translations } = useDefaultLayoutContext(), $label = $i18n$1(translations, "Quality");
  return html`
    <media-quality-slider class="vds-quality-slider vds-slider" aria-label=${$label}>
      ${DefaultSliderParts()}${DefaultSliderSteps()}
    </media-quality-slider>
  `;
}

function DefaultSettingsMenu({
  placement,
  portal,
  tooltip
}) {
  return $signal(() => {
    const { viewType } = useMediaState(), {
      translations,
      menuPortal,
      noModal,
      menuGroup,
      smallWhen: smWhen
    } = useDefaultLayoutContext(), $placement = computed(
      () => noModal() ? unwrap(placement) : !smWhen() ? unwrap(placement) : null
    ), $offset = computed(
      () => !smWhen() && menuGroup() === "bottom" && viewType() === "video" ? 26 : 0
    ), $isOpen = signal(false);
    updateFontCssVars();
    function onOpen() {
      $isOpen.set(true);
    }
    function onClose() {
      $isOpen.set(false);
    }
    const items = html`
      <media-menu-items
        class="vds-settings-menu-items vds-menu-items"
        placement=${$signal($placement)}
        offset=${$signal($offset)}
      >
        ${$signal(() => {
      if (!$isOpen()) {
        return null;
      }
      return [
        DefaultPlaybackMenu(),
        DefaultAccessibilityMenu(),
        DefaultAudioMenu(),
        DefaultCaptionsMenu()
      ];
    })}
      </media-menu-items>
    `;
    return html`
      <media-menu class="vds-settings-menu vds-menu" @open=${onOpen} @close=${onClose}>
        <media-tooltip class="vds-tooltip">
          <media-tooltip-trigger>
            <media-menu-button
              class="vds-menu-button vds-button"
              aria-label=${$i18n$1(translations, "Settings")}
            >
              ${IconSlot("menu-settings", "vds-rotate-icon")}
            </media-menu-button>
          </media-tooltip-trigger>
          <media-tooltip-content
            class="vds-tooltip-content"
            placement=${isFunction(tooltip) ? $signal(tooltip) : tooltip}
          >
            ${$i18n$1(translations, "Settings")}
          </media-tooltip-content>
        </media-tooltip>
        ${portal ? MenuPortal$1(menuPortal, items) : items}
      </media-menu>
    `;
  });
}

function DefaultVolumePopup({
  orientation,
  tooltip
}) {
  return $signal(() => {
    const { pointer, muted, canSetVolume } = useMediaState();
    if (pointer() === "coarse" && !muted()) return null;
    if (!canSetVolume()) {
      return DefaultMuteButton({ tooltip });
    }
    const $rootRef = signal(void 0), $isRootActive = useActive($rootRef);
    return html`
      <div class="vds-volume" ?data-active=${$signal($isRootActive)} ${ref($rootRef.set)}>
        ${DefaultMuteButton({ tooltip })}
        <div class="vds-volume-popup">${DefaultVolumeSlider({ orientation })}</div>
      </div>
    `;
  });
}
function DefaultVolumeSlider({ orientation } = {}) {
  const { translations } = useDefaultLayoutContext(), $label = $i18n$1(translations, "Volume");
  return html`
    <media-volume-slider
      class="vds-volume-slider vds-slider"
      aria-label=${$label}
      orientation=${ifDefined(orientation)}
    >
      <div class="vds-slider-track"></div>
      <div class="vds-slider-track-fill vds-slider-track"></div>
      <media-slider-preview class="vds-slider-preview" no-clamp>
        <media-slider-value class="vds-slider-value"></media-slider-value>
      </media-slider-preview>
      <div class="vds-slider-thumb"></div>
    </media-volume-slider>
  `;
}
function DefaultTimeSlider() {
  const $ref = signal(void 0), $width = signal(0), {
    thumbnails,
    translations,
    sliderChaptersMinWidth,
    disableTimeSlider,
    seekStep,
    noScrubGesture
  } = useDefaultLayoutContext(), $label = $i18n$1(translations, "Seek"), $isDisabled = $signal(disableTimeSlider), $isChaptersDisabled = $signal(() => $width() < sliderChaptersMinWidth()), $thumbnails = $signal(thumbnails);
  useResizeObserver($ref, () => {
    const el = $ref();
    el && $width.set(el.clientWidth);
  });
  return html`
    <media-time-slider
      class="vds-time-slider vds-slider"
      aria-label=${$label}
      key-step=${$signal(seekStep)}
      ?disabled=${$isDisabled}
      ?no-swipe-gesture=${$signal(noScrubGesture)}
      ${ref($ref.set)}
    >
      <media-slider-chapters class="vds-slider-chapters" ?disabled=${$isChaptersDisabled}>
        <template>
          <div class="vds-slider-chapter">
            <div class="vds-slider-track"></div>
            <div class="vds-slider-track-fill vds-slider-track"></div>
            <div class="vds-slider-progress vds-slider-track"></div>
          </div>
        </template>
      </media-slider-chapters>
      <div class="vds-slider-thumb"></div>
      <media-slider-preview class="vds-slider-preview">
        <media-slider-thumbnail
          class="vds-slider-thumbnail vds-thumbnail"
          .src=${$thumbnails}
        ></media-slider-thumbnail>
        <div class="vds-slider-chapter-title" data-part="chapter-title"></div>
        <media-slider-value class="vds-slider-value"></media-slider-value>
      </media-slider-preview>
    </media-time-slider>
  `;
}

function DefaultTimeGroup() {
  return html`
    <div class="vds-time-group">
      ${$signal(() => {
    const { duration } = useMediaState();
    if (!duration()) return null;
    return [
      html`<media-time class="vds-time" type="current"></media-time>`,
      html`<div class="vds-time-divider">/</div>`,
      html`<media-time class="vds-time" type="duration"></media-time>`
    ];
  })}
    </div>
  `;
}
function DefaultTimeInvert() {
  return $signal(() => {
    const { live, duration } = useMediaState();
    return live() ? DefaultLiveButton() : duration() ? html`<media-time class="vds-time" type="current" toggle remainder></media-time>` : null;
  });
}
function DefaultTimeInfo() {
  return $signal(() => {
    const { live } = useMediaState();
    return live() ? DefaultLiveButton() : DefaultTimeGroup();
  });
}

function DefaultTitle() {
  return $signal(() => {
    const { textTracks } = useMediaContext(), { title, started } = useMediaState(), $hasChapters = signal(null);
    watchActiveTextTrack(textTracks, "chapters", $hasChapters.set);
    return $hasChapters() && (started() || !title()) ? DefaultChapterTitle() : html`<media-title class="vds-chapter-title"></media-title>`;
  });
}
function DefaultChapterTitle() {
  return html`<media-chapter-title class="vds-chapter-title"></media-chapter-title>`;
}

function DefaultAudioLayout() {
  return [
    DefaultAnnouncer(),
    DefaultCaptions(),
    html`
      <media-controls class="vds-controls">
        <media-controls-group class="vds-controls-group">
          ${[
      DefaultSeekButton({ backward: true, tooltip: "top start" }),
      DefaultPlayButton({ tooltip: "top" }),
      DefaultSeekButton({ tooltip: "top" }),
      DefaultAudioTitle(),
      DefaultTimeSlider(),
      DefaultTimeInvert(),
      DefaultVolumePopup({ orientation: "vertical", tooltip: "top" }),
      DefaultCaptionButton({ tooltip: "top" }),
      DefaultDownloadButton(),
      DefaultAirPlayButton({ tooltip: "top" }),
      DefaultAudioMenus()
    ]}
        </media-controls-group>
      </media-controls>
    `
  ];
}
function DefaultAudioTitle() {
  return $signal(() => {
    let $ref = signal(void 0), $isTextOverflowing = signal(false), media = useMediaContext(), { title, started, currentTime, ended } = useMediaState(), { translations } = useDefaultLayoutContext(), $isTransitionActive = useTransitionActive($ref), $isContinued = () => started() || currentTime() > 0;
    const $title = () => {
      const word = ended() ? "Replay" : $isContinued() ? "Continue" : "Play";
      return `${i18n$1(translations, word)}: ${title()}`;
    };
    effect(() => {
      if ($isTransitionActive() && document.activeElement === document.body) {
        media.player.el?.focus({ preventScroll: true });
      }
    });
    function onResize() {
      const el = $ref(), isOverflowing = !!el && !$isTransitionActive() && el.clientWidth < el.children[0].clientWidth;
      el && toggleClass(el, "vds-marquee", isOverflowing);
      $isTextOverflowing.set(isOverflowing);
    }
    function Title() {
      return html`
        <span class="vds-title-text">
          ${$signal($title)}${$signal(() => $isContinued() ? DefaultChapterTitle() : null)}
        </span>
      `;
    }
    useResizeObserver($ref, onResize);
    return title() ? html`
          <span class="vds-title" title=${$signal($title)} ${ref($ref.set)}>
            ${[
      Title(),
      $signal(() => $isTextOverflowing() && !$isTransitionActive() ? Title() : null)
    ]}
          </span>
        ` : DefaultControlsSpacer();
  });
}
function DefaultAudioMenus() {
  const placement = "top end";
  return [
    DefaultChaptersMenu({ tooltip: "top", placement, portal: true }),
    DefaultSettingsMenu({ tooltip: "top end", placement, portal: true })
  ];
}

const HTML_RESULT = 1;
class UnsafeHTMLDirective extends Directive {
  constructor(partInfo) {
    super(partInfo);
    this._value = nothing;
    if (partInfo.type !== PartType.CHILD) {
      throw new Error(`${this.constructor.directiveName}() can only be used in child bindings`);
    }
  }
  render(value) {
    if (value === nothing || value == null) {
      this._templateResult = void 0;
      return this._value = value;
    }
    if (value === noChange) {
      return value;
    }
    if (typeof value != "string") {
      throw new Error(`${this.constructor.directiveName}() called with a non-string value`);
    }
    if (value === this._value) {
      return this._templateResult;
    }
    this._value = value;
    const strings = [value];
    strings.raw = strings;
    return this._templateResult = {
      // Cast to a known set of integers that satisfy ResultType so that we
      // don't have to export ResultType and possibly encourage this pattern.
      // This property needs to remain unminified.
      ["_$litType$"]: this.constructor.resultType,
      strings,
      values: []
    };
  }
}
UnsafeHTMLDirective.directiveName = "unsafeHTML";
UnsafeHTMLDirective.resultType = HTML_RESULT;
const unsafeHTML = directive(UnsafeHTMLDirective);

const SVG_RESULT = 2;
class UnsafeSVGDirective extends UnsafeHTMLDirective {
}
UnsafeSVGDirective.directiveName = "unsafeSVG";
UnsafeSVGDirective.resultType = SVG_RESULT;
const unsafeSVG = directive(UnsafeSVGDirective);

function Icon({ name, class: _class, state, paths, viewBox = "0 0 32 32" }) {
  return html`<svg
    class="${"vds-icon" + (_class ? ` ${_class}` : "")}"
    viewBox="${viewBox}"
    fill="none"
    aria-hidden="true"
    focusable="false"
    xmlns="http://www.w3.org/2000/svg"
    data-icon=${ifDefined(name ?? state)}
  >
    ${!isString(paths) ? $signal(paths) : unsafeSVG(paths)}
  </svg>`;
}

class IconsLoader {
  #icons = {};
  #loaded = false;
  slots;
  constructor(roots) {
    this.slots = new SlotObserver(roots, this.#insertIcons.bind(this));
  }
  connect() {
    this.slots.connect();
  }
  load() {
    this.loadIcons().then((icons) => {
      this.#icons = icons;
      this.#loaded = true;
      this.#insertIcons();
    });
  }
  *#iterate() {
    for (const iconName of Object.keys(this.#icons)) {
      const slotName = `${iconName}-icon`;
      for (const slot of this.slots.elements) {
        if (slot.name !== slotName) continue;
        yield { icon: this.#icons[iconName], slot };
      }
    }
  }
  #insertIcons() {
    if (!this.#loaded) return;
    for (const { icon, slot } of this.#iterate()) {
      this.slots.assign(icon, slot);
    }
  }
}

class LayoutIconsLoader extends IconsLoader {
  connect() {
    super.connect();
    const { player } = useMediaContext();
    if (!player.el) return;
    let dispose, observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      dispose?.();
      dispose = void 0;
      this.load();
    });
    observer.observe(player.el);
    dispose = onDispose(() => observer.disconnect());
  }
}

class DefaultLayoutIconsLoader extends LayoutIconsLoader {
  async loadIcons() {
    const paths = (await Promise.resolve().then(function () { return icons$3; })).icons, icons = {};
    for (const iconName of Object.keys(paths)) {
      icons[iconName] = Icon({ name: iconName, paths: paths[iconName] });
    }
    return icons;
  }
}

class MediaAudioLayoutElement extends Host(LitElement, DefaultAudioLayout$1) {
  static tagName = "media-audio-layout";
  static attrs = {
    smallWhen: {
      converter(value) {
        return value !== "never" && !!value;
      }
    }
  };
  #media;
  #scrubbing = signal(false);
  onSetup() {
    this.forwardKeepAlive = false;
    this.#media = useMediaContext();
    this.classList.add("vds-audio-layout");
    this.#setupWatchScrubbing();
  }
  onConnect() {
    setLayoutName("audio", () => this.isMatch);
    this.#setupMenuContainer();
  }
  render() {
    return $signal(this.#render.bind(this));
  }
  #render() {
    return this.isMatch ? DefaultAudioLayout() : null;
  }
  #setupMenuContainer() {
    const { menuPortal } = useDefaultLayoutContext();
    effect(() => {
      if (!this.isMatch) return;
      const container = createMenuContainer(
        this,
        this.menuContainer,
        "vds-audio-layout",
        () => this.isSmallLayout
      ), roots = container ? [this, container] : [this];
      const iconsManager = this.$props.customIcons() ? new SlotManager(roots) : new DefaultLayoutIconsLoader(roots);
      iconsManager.connect();
      menuPortal.set(container);
      return () => {
        container.remove();
        menuPortal.set(null);
      };
    });
  }
  #setupWatchScrubbing() {
    const { pointer } = this.#media.$state;
    effect(() => {
      if (pointer() !== "coarse") return;
      effect(this.#watchScrubbing.bind(this));
    });
  }
  #watchScrubbing() {
    if (!this.#scrubbing()) {
      listenEvent(this, "pointerdown", this.#onStartScrubbing.bind(this), { capture: true });
      return;
    }
    listenEvent(this, "pointerdown", (e) => e.stopPropagation());
    listenEvent(window, "pointerdown", this.#onStopScrubbing.bind(this));
  }
  #onStartScrubbing(event) {
    const { target } = event, hasTimeSlider = !!(isHTMLElement(target) && target.closest(".vds-time-slider"));
    if (!hasTimeSlider) return;
    event.stopImmediatePropagation();
    this.setAttribute("data-scrubbing", "");
    this.#scrubbing.set(true);
  }
  #onStopScrubbing() {
    this.#scrubbing.set(false);
    this.removeAttribute("data-scrubbing");
  }
}

class DefaultVideoLayout extends DefaultLayout {
  static props = {
    ...super.props,
    when: ({ viewType }) => viewType === "video",
    smallWhen: ({ width, height }) => width < 576 || height < 380
  };
}

class Keyed extends Directive {
  constructor() {
    super(...arguments);
    this.key = nothing;
  }
  render(k, v) {
    this.key = k;
    return v;
  }
  update(part, [k, v]) {
    if (k !== this.key) {
      setCommittedValue(part);
      this.key = k;
    }
    return v;
  }
}
const keyed = directive(Keyed);

function DefaultKeyboardDisplay() {
  return $signal(() => {
    const media = useMediaContext(), { noKeyboardAnimations, userPrefersKeyboardAnimations } = useDefaultLayoutContext(), $disabled = computed(() => noKeyboardAnimations() || !userPrefersKeyboardAnimations());
    if ($disabled()) {
      return null;
    }
    const visible = signal(false), { lastKeyboardAction } = media.$state;
    effect(() => {
      visible.set(!!lastKeyboardAction());
      const id = setTimeout(() => visible.set(false), 500);
      return () => {
        visible.set(false);
        window.clearTimeout(id);
      };
    });
    const $actionDataAttr = computed(() => {
      const action = lastKeyboardAction()?.action;
      return action && visible() ? camelToKebabCase(action) : null;
    });
    const $classList = computed(() => `vds-kb-action${!visible() ? " hidden" : ""}`), $text = computed(getText), $iconSlot = computed(() => {
      const name = getIconName();
      return name ? createSlot(name) : null;
    });
    function Icon() {
      const $slot = $iconSlot();
      if (!$slot) return null;
      return html`
        <div class="vds-kb-bezel">
          <div class="vds-kb-icon">${$slot}</div>
        </div>
      `;
    }
    return html`
      <div class=${$signal($classList)} data-action=${$signal($actionDataAttr)}>
        <div class="vds-kb-text-wrapper">
          <div class="vds-kb-text">${$signal($text)}</div>
        </div>
        ${$signal(() => keyed(lastKeyboardAction(), Icon()))}
      </div>
    `;
  });
}
function getText() {
  const { $state } = useMediaContext(), action = $state.lastKeyboardAction()?.action, audioGain = $state.audioGain() ?? 1;
  switch (action) {
    case "toggleMuted":
      return $state.muted() ? "0%" : getVolumeText($state.volume(), audioGain);
    case "volumeUp":
    case "volumeDown":
      return getVolumeText($state.volume(), audioGain);
    default:
      return "";
  }
}
function getVolumeText(volume, gain) {
  return `${Math.round(volume * gain * 100)}%`;
}
function getIconName() {
  const { $state } = useMediaContext(), action = $state.lastKeyboardAction()?.action;
  switch (action) {
    case "togglePaused":
      return !$state.paused() ? "kb-play-icon" : "kb-pause-icon";
    case "toggleMuted":
      return $state.muted() || $state.volume() === 0 ? "kb-mute-icon" : $state.volume() >= 0.5 ? "kb-volume-up-icon" : "kb-volume-down-icon";
    case "toggleFullscreen":
      return `kb-fs-${$state.fullscreen() ? "enter" : "exit"}-icon`;
    case "togglePictureInPicture":
      return `kb-pip-${$state.pictureInPicture() ? "enter" : "exit"}-icon`;
    case "toggleCaptions":
      return $state.hasCaptions() ? `kb-cc-${$state.textTrack() ? "on" : "off"}-icon` : null;
    case "volumeUp":
      return "kb-volume-up-icon";
    case "volumeDown":
      return "kb-volume-down-icon";
    case "seekForward":
      return "kb-seek-forward-icon";
    case "seekBackward":
      return "kb-seek-backward-icon";
    default:
      return null;
  }
}

function DefaultVideoLayoutLarge() {
  return [
    DefaultAnnouncer(),
    DefaultVideoGestures(),
    DefaultBufferingIndicator(),
    DefaultKeyboardDisplay(),
    DefaultCaptions(),
    html`<div class="vds-scrim"></div>`,
    html`
      <media-controls class="vds-controls">
        ${[
      DefaultControlsGroupTop(),
      DefaultControlsSpacer(),
      html`<media-controls-group class="vds-controls-group"></media-controls-group>`,
      DefaultControlsSpacer(),
      html`
            <media-controls-group class="vds-controls-group">
              ${DefaultTimeSlider()}
            </media-controls-group>
          `,
      html`
            <media-controls-group class="vds-controls-group">
              ${[
        DefaultPlayButton({ tooltip: "top start" }),
        DefaultVolumePopup({ orientation: "horizontal", tooltip: "top" }),
        DefaultTimeInfo(),
        DefaultTitle(),
        DefaultCaptionButton({ tooltip: "top" }),
        DefaultBottomMenuGroup(),
        DefaultAirPlayButton({ tooltip: "top" }),
        DefaultGoogleCastButton({ tooltip: "top" }),
        DefaultDownloadButton(),
        DefaultPIPButton(),
        DefaultFullscreenButton({ tooltip: "top end" })
      ]}
            </media-controls-group>
          `
    ]}
      </media-controls>
    `
  ];
}
function DefaultBottomMenuGroup() {
  return $signal(() => {
    const { menuGroup } = useDefaultLayoutContext();
    return menuGroup() === "bottom" ? DefaultVideoMenus() : null;
  });
}
function DefaultControlsGroupTop() {
  return html`
    <media-controls-group class="vds-controls-group">
      ${$signal(() => {
    const { menuGroup } = useDefaultLayoutContext();
    return menuGroup() === "top" ? [DefaultControlsSpacer(), DefaultVideoMenus()] : null;
  })}
    </media-controls-group>
  `;
}
function DefaultVideoLayoutSmall() {
  return [
    DefaultAnnouncer(),
    DefaultVideoGestures(),
    DefaultBufferingIndicator(),
    DefaultCaptions(),
    DefaultKeyboardDisplay(),
    html`<div class="vds-scrim"></div>`,
    html`
      <media-controls class="vds-controls">
        <media-controls-group class="vds-controls-group">
          ${[
      DefaultAirPlayButton({ tooltip: "top start" }),
      DefaultGoogleCastButton({ tooltip: "bottom start" }),
      DefaultControlsSpacer(),
      DefaultCaptionButton({ tooltip: "bottom" }),
      DefaultDownloadButton(),
      DefaultVideoMenus(),
      DefaultVolumePopup({ orientation: "vertical", tooltip: "bottom end" })
    ]}
        </media-controls-group>

        ${DefaultControlsSpacer()}

        <media-controls-group class="vds-controls-group" style="pointer-events: none;">
          ${[
      DefaultControlsSpacer(),
      DefaultPlayButton({ tooltip: "top" }),
      DefaultControlsSpacer()
    ]}
        </media-controls-group>

        ${DefaultControlsSpacer()}

        <media-controls-group class="vds-controls-group">
          ${[DefaultTimeInfo(), DefaultTitle(), DefaultFullscreenButton({ tooltip: "top end" })]}
        </media-controls-group>

        <media-controls-group class="vds-controls-group">
          ${DefaultTimeSlider()}
        </media-controls-group>
      </media-controls>
    `,
    StartDuration()
  ];
}
function DefaultVideoLoadLayout() {
  return html`
    <div class="vds-load-container">
      ${[DefaultBufferingIndicator(), DefaultPlayButton({ tooltip: "top" })]}
    </div>
  `;
}
function StartDuration() {
  return $signal(() => {
    const { duration } = useMediaState();
    if (duration() === 0) return null;
    return html`
      <div class="vds-start-duration">
        <media-time class="vds-time" type="duration"></media-time>
      </div>
    `;
  });
}
function DefaultBufferingIndicator() {
  return html`
    <div class="vds-buffering-indicator">
      <media-spinner class="vds-buffering-spinner"></media-spinner>
    </div>
  `;
}
function DefaultVideoMenus() {
  const { menuGroup, smallWhen: smWhen } = useDefaultLayoutContext(), $side = () => menuGroup() === "top" || smWhen() ? "bottom" : "top", $tooltip = computed(() => `${$side()} ${menuGroup() === "top" ? "end" : "center"}`), $placement = computed(() => `${$side()} end`);
  return [
    DefaultChaptersMenu({ tooltip: $tooltip, placement: $placement, portal: true }),
    DefaultSettingsMenu({ tooltip: $tooltip, placement: $placement, portal: true })
  ];
}
function DefaultVideoGestures() {
  return $signal(() => {
    const { noGestures } = useDefaultLayoutContext();
    if (noGestures()) return null;
    return html`
      <div class="vds-gestures">
        <media-gesture class="vds-gesture" event="pointerup" action="toggle:paused"></media-gesture>
        <media-gesture
          class="vds-gesture"
          event="pointerup"
          action="toggle:controls"
        ></media-gesture>
        <media-gesture
          class="vds-gesture"
          event="dblpointerup"
          action="toggle:fullscreen"
        ></media-gesture>
        <media-gesture class="vds-gesture" event="dblpointerup" action="seek:-10"></media-gesture>
        <media-gesture class="vds-gesture" event="dblpointerup" action="seek:10"></media-gesture>
      </div>
    `;
  });
}

class MediaVideoLayoutElement extends Host(LitElement, DefaultVideoLayout) {
  static tagName = "media-video-layout";
  static attrs = {
    smallWhen: {
      converter(value) {
        return value !== "never" && !!value;
      }
    }
  };
  #media;
  onSetup() {
    this.forwardKeepAlive = false;
    this.#media = useMediaContext();
    this.classList.add("vds-video-layout");
  }
  onConnect() {
    setLayoutName("video", () => this.isMatch);
    this.#setupMenuContainer();
  }
  render() {
    return $signal(this.#render.bind(this));
  }
  #setupMenuContainer() {
    const { menuPortal } = useDefaultLayoutContext();
    effect(() => {
      if (!this.isMatch) return;
      const container = createMenuContainer(
        this,
        this.menuContainer,
        "vds-video-layout",
        () => this.isSmallLayout
      ), roots = container ? [this, container] : [this];
      const iconsManager = this.$props.customIcons() ? new SlotManager(roots) : new DefaultLayoutIconsLoader(roots);
      iconsManager.connect();
      menuPortal.set(container);
      return () => {
        container.remove();
        menuPortal.set(null);
      };
    });
  }
  #render() {
    const { load } = this.#media.$props, { canLoad, streamType, nativeControls } = this.#media.$state;
    return !nativeControls() && this.isMatch ? load() === "play" && !canLoad() ? DefaultVideoLoadLayout() : streamType() === "unknown" ? DefaultBufferingIndicator() : this.isSmallLayout ? DefaultVideoLayoutSmall() : DefaultVideoLayoutLarge() : null;
  }
}

defineCustomElement(MediaAudioLayoutElement);
defineCustomElement(MediaVideoLayoutElement);

var _default = /*#__PURE__*/Object.freeze({
  __proto__: null
});

function padNumberWithZeroes(num, expectedLength) {
  const str = String(num);
  const actualLength = str.length;
  const shouldPad = actualLength < expectedLength;
  if (shouldPad) {
    const padLength = expectedLength - actualLength;
    const padding = `0`.repeat(padLength);
    return `${padding}${num}`;
  }
  return str;
}
function parseTime(duration) {
  const hours = Math.trunc(duration / 3600);
  const minutes = Math.trunc(duration % 3600 / 60);
  const seconds = Math.trunc(duration % 60);
  const fraction = Number((duration - Math.trunc(duration)).toPrecision(3));
  return {
    hours,
    minutes,
    seconds,
    fraction
  };
}
function formatTime(duration, { padHrs = null, padMins = null, showHrs = false, showMs = false } = {}) {
  const { hours, minutes, seconds, fraction } = parseTime(duration), paddedHours = padHrs ? padNumberWithZeroes(hours, 2) : hours, paddedMinutes = padMins || isNull(padMins) && duration >= 3600 ? padNumberWithZeroes(minutes, 2) : minutes, paddedSeconds = padNumberWithZeroes(seconds, 2), paddedMs = showMs && fraction > 0 ? `.${String(fraction).replace(/^0?\./, "")}` : "", time = `${paddedMinutes}:${paddedSeconds}${paddedMs}`;
  return hours > 0 || showHrs ? `${paddedHours}:${time}` : time;
}
function formatSpokenTime(duration) {
  const spokenParts = [];
  const { hours, minutes, seconds } = parseTime(duration);
  if (hours > 0) {
    spokenParts.push(`${hours} hour`);
  }
  if (minutes > 0) {
    spokenParts.push(`${minutes} min`);
  }
  if (seconds > 0 || spokenParts.length === 0) {
    spokenParts.push(`${seconds} sec`);
  }
  return spokenParts.join(" ");
}

class MediaAnnouncer extends Component {
  static props = {
    translations: null
  };
  static state = new State({
    label: null,
    busy: false
  });
  #media;
  #initializing = false;
  onSetup() {
    this.#media = useMediaContext();
  }
  onAttach(el) {
    el.style.display = "contents";
  }
  onConnect(el) {
    el.setAttribute("data-media-announcer", "");
    setAttributeIfEmpty(el, "role", "status");
    setAttributeIfEmpty(el, "aria-live", "polite");
    const { busy } = this.$state;
    this.setAttributes({
      "aria-busy": () => busy() ? "true" : null
    });
    this.#initializing = true;
    effect(this.#watchPaused.bind(this));
    effect(this.#watchVolume.bind(this));
    effect(this.#watchCaptions.bind(this));
    effect(this.#watchFullscreen.bind(this));
    effect(this.#watchPiP.bind(this));
    effect(this.#watchSeeking.bind(this));
    effect(this.#watchLabel.bind(this));
    tick();
    this.#initializing = false;
  }
  #watchPaused() {
    const { paused } = this.#media.$state;
    this.#setLabel(!paused() ? "Play" : "Pause");
  }
  #watchFullscreen() {
    const { fullscreen } = this.#media.$state;
    this.#setLabel(fullscreen() ? "Enter Fullscreen" : "Exit Fullscreen");
  }
  #watchPiP() {
    const { pictureInPicture } = this.#media.$state;
    this.#setLabel(pictureInPicture() ? "Enter PiP" : "Exit PiP");
  }
  #watchCaptions() {
    const { textTrack } = this.#media.$state;
    this.#setLabel(textTrack() ? "Closed-Captions On" : "Closed-Captions Off");
  }
  #watchVolume() {
    const { muted, volume, audioGain } = this.#media.$state;
    this.#setLabel(
      muted() || volume() === 0 ? "Mute" : `${Math.round(volume() * (audioGain() ?? 1) * 100)}% ${this.#translate("Volume")}`
    );
  }
  #startedSeekingAt = -1;
  #seekTimer = -1;
  #watchSeeking() {
    const { seeking, currentTime } = this.#media.$state, isSeeking = seeking();
    if (this.#startedSeekingAt > 0) {
      window.clearTimeout(this.#seekTimer);
      this.#seekTimer = window.setTimeout(() => {
        if (!this.scope) return;
        const newTime = peek(currentTime), seconds = Math.abs(newTime - this.#startedSeekingAt);
        if (seconds >= 1) {
          const isForward = newTime >= this.#startedSeekingAt, spokenTime = formatSpokenTime(seconds);
          this.#setLabel(
            `${this.#translate(isForward ? "Seek Forward" : "Seek Backward")} ${spokenTime}`
          );
        }
        this.#startedSeekingAt = -1;
        this.#seekTimer = -1;
      }, 300);
    } else if (isSeeking) {
      this.#startedSeekingAt = peek(currentTime);
    }
  }
  #translate(word) {
    const { translations } = this.$props;
    return translations?.()?.[word || ""] ?? word;
  }
  #watchLabel() {
    const { label, busy } = this.$state, $label = this.#translate(label());
    if (this.#initializing) return;
    busy.set(true);
    const id = window.setTimeout(() => void busy.set(false), 150);
    this.el && setAttribute(this.el, "aria-label", $label);
    if (isString($label)) {
      this.dispatch("change", { detail: $label });
    }
    return () => window.clearTimeout(id);
  }
  #setLabel(word) {
    const { label } = this.$state;
    label.set(word);
  }
}

class MediaAnnouncerElement extends Host(HTMLElement, MediaAnnouncer) {
  static tagName = "media-announcer";
}

class ARIAKeyShortcuts extends ViewController {
  #shortcut;
  constructor(shortcut) {
    super();
    this.#shortcut = shortcut;
  }
  onAttach(el) {
    const { $props, ariaKeys } = useMediaContext(), keys = el.getAttribute("aria-keyshortcuts");
    if (keys) {
      ariaKeys[this.#shortcut] = keys;
      {
        onDispose(() => {
          delete ariaKeys[this.#shortcut];
        });
      }
      return;
    }
    const shortcuts = $props.keyShortcuts()[this.#shortcut];
    if (shortcuts) {
      const keys2 = isArray$1(shortcuts) ? shortcuts.join(" ") : isString(shortcuts) ? shortcuts : shortcuts?.keys;
      el.setAttribute("aria-keyshortcuts", isArray$1(keys2) ? keys2.join(" ") : keys2);
    }
  }
}

class ToggleButtonController extends ViewController {
  static props = {
    disabled: false
  };
  #delegate;
  constructor(delegate) {
    super();
    this.#delegate = delegate;
    new FocusVisibleController();
    if (delegate.keyShortcut) {
      new ARIAKeyShortcuts(delegate.keyShortcut);
    }
  }
  onSetup() {
    const { disabled } = this.$props;
    this.setAttributes({
      "data-pressed": this.#delegate.isPresssed,
      "aria-pressed": this.#isARIAPressed.bind(this),
      "aria-disabled": () => disabled() ? "true" : null
    });
  }
  onAttach(el) {
    setAttributeIfEmpty(el, "tabindex", "0");
    setAttributeIfEmpty(el, "role", "button");
    setAttributeIfEmpty(el, "type", "button");
  }
  onConnect(el) {
    const events = onPress(el, this.#onMaybePress.bind(this));
    for (const type of ["click", "touchstart"]) {
      events.add(type, this.#onInteraction.bind(this), {
        passive: true
      });
    }
  }
  #isARIAPressed() {
    return ariaBool$1(this.#delegate.isPresssed());
  }
  #onPressed(event) {
    if (isWriteSignal(this.#delegate.isPresssed)) {
      this.#delegate.isPresssed.set((p) => !p);
    }
  }
  #onMaybePress(event) {
    const disabled = this.$props.disabled() || this.el.hasAttribute("data-disabled");
    if (disabled) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    event.preventDefault();
    (this.#delegate.onPress ?? this.#onPressed).call(this, event);
  }
  #onInteraction(event) {
    if (this.$props.disabled()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
}

let AirPlayButton$1 = class AirPlayButton extends Component {
  static props = ToggleButtonController.props;
  #media;
  constructor() {
    super();
    new ToggleButtonController({
      isPresssed: this.#isPressed.bind(this),
      onPress: this.#onPress.bind(this)
    });
  }
  onSetup() {
    this.#media = useMediaContext();
    const { canAirPlay, isAirPlayConnected } = this.#media.$state;
    this.setAttributes({
      "data-active": isAirPlayConnected,
      "data-supported": canAirPlay,
      "data-state": this.#getState.bind(this),
      "aria-hidden": $ariaBool(() => !canAirPlay())
    });
  }
  onAttach(el) {
    el.setAttribute("data-media-tooltip", "airplay");
    setARIALabel(el, this.#getDefaultLabel.bind(this));
  }
  #onPress(event) {
    const remote = this.#media.remote;
    remote.requestAirPlay(event);
  }
  #isPressed() {
    const { remotePlaybackType, remotePlaybackState } = this.#media.$state;
    return remotePlaybackType() === "airplay" && remotePlaybackState() !== "disconnected";
  }
  #getState() {
    const { remotePlaybackType, remotePlaybackState } = this.#media.$state;
    return remotePlaybackType() === "airplay" && remotePlaybackState();
  }
  #getDefaultLabel() {
    const { remotePlaybackState } = this.#media.$state;
    return `AirPlay ${remotePlaybackState()}`;
  }
};

class MediaAirPlayButtonElement extends Host(HTMLElement, AirPlayButton$1) {
  static tagName = "media-airplay-button";
}

class CaptionButton extends Component {
  static props = ToggleButtonController.props;
  #media;
  constructor() {
    super();
    new ToggleButtonController({
      isPresssed: this.#isPressed.bind(this),
      keyShortcut: "toggleCaptions",
      onPress: this.#onPress.bind(this)
    });
  }
  onSetup() {
    this.#media = useMediaContext();
    this.setAttributes({
      "data-active": this.#isPressed.bind(this),
      "data-supported": () => !this.#isHidden(),
      "aria-hidden": $ariaBool(this.#isHidden.bind(this))
    });
  }
  onAttach(el) {
    el.setAttribute("data-media-tooltip", "caption");
    setARIALabel(el, "Captions");
  }
  #onPress(event) {
    this.#media.remote.toggleCaptions(event);
  }
  #isPressed() {
    const { textTrack } = this.#media.$state, track = textTrack();
    return !!track && isTrackCaptionKind(track);
  }
  #isHidden() {
    const { hasCaptions } = this.#media.$state;
    return !hasCaptions();
  }
}

class MediaCaptionButtonElement extends Host(HTMLElement, CaptionButton) {
  static tagName = "media-caption-button";
}

let FullscreenButton$1 = class FullscreenButton extends Component {
  static props = {
    ...ToggleButtonController.props,
    target: "prefer-media"
  };
  #media;
  constructor() {
    super();
    new ToggleButtonController({
      isPresssed: this.#isPressed.bind(this),
      keyShortcut: "toggleFullscreen",
      onPress: this.#onPress.bind(this)
    });
  }
  onSetup() {
    this.#media = useMediaContext();
    const { fullscreen } = this.#media.$state, isSupported = this.#isSupported.bind(this);
    this.setAttributes({
      "data-active": fullscreen,
      "data-supported": isSupported,
      "aria-hidden": $ariaBool(() => !isSupported())
    });
  }
  onAttach(el) {
    el.setAttribute("data-media-tooltip", "fullscreen");
    setARIALabel(el, "Fullscreen");
  }
  #onPress(event) {
    const remote = this.#media.remote, target = this.$props.target();
    this.#isPressed() ? remote.exitFullscreen(target, event) : remote.enterFullscreen(target, event);
  }
  #isPressed() {
    const { fullscreen } = this.#media.$state;
    return fullscreen();
  }
  #isSupported() {
    const { canFullscreen } = this.#media.$state;
    return canFullscreen();
  }
};

class MediaFullscreenButtonElement extends Host(HTMLElement, FullscreenButton$1) {
  static tagName = "media-fullscreen-button";
}

class GoogleCastButton extends Component {
  static props = ToggleButtonController.props;
  #media;
  constructor() {
    super();
    new ToggleButtonController({
      isPresssed: this.#isPressed.bind(this),
      onPress: this.#onPress.bind(this)
    });
  }
  onSetup() {
    this.#media = useMediaContext();
    const { canGoogleCast, isGoogleCastConnected } = this.#media.$state;
    this.setAttributes({
      "data-active": isGoogleCastConnected,
      "data-supported": canGoogleCast,
      "data-state": this.#getState.bind(this),
      "aria-hidden": $ariaBool(() => !canGoogleCast())
    });
  }
  onAttach(el) {
    el.setAttribute("data-media-tooltip", "google-cast");
    setARIALabel(el, this.#getDefaultLabel.bind(this));
  }
  #onPress(event) {
    const remote = this.#media.remote;
    remote.requestGoogleCast(event);
  }
  #isPressed() {
    const { remotePlaybackType, remotePlaybackState } = this.#media.$state;
    return remotePlaybackType() === "google-cast" && remotePlaybackState() !== "disconnected";
  }
  #getState() {
    const { remotePlaybackType, remotePlaybackState } = this.#media.$state;
    return remotePlaybackType() === "google-cast" && remotePlaybackState();
  }
  #getDefaultLabel() {
    const { remotePlaybackState } = this.#media.$state;
    return `Google Cast ${remotePlaybackState()}`;
  }
}

class MediaGoogleCastButtonElement extends Host(HTMLElement, GoogleCastButton) {
  static tagName = "media-google-cast-button";
}

class LiveButton extends Component {
  static props = {
    disabled: false
  };
  #media;
  constructor() {
    super();
    new FocusVisibleController();
  }
  onSetup() {
    this.#media = useMediaContext();
    const { disabled } = this.$props, { live, liveEdge } = this.#media.$state, isHidden = () => !live();
    this.setAttributes({
      "data-edge": liveEdge,
      "data-hidden": isHidden,
      "aria-disabled": $ariaBool(() => disabled() || liveEdge()),
      "aria-hidden": $ariaBool(isHidden)
    });
  }
  onAttach(el) {
    setAttributeIfEmpty(el, "tabindex", "0");
    setAttributeIfEmpty(el, "role", "button");
    setAttributeIfEmpty(el, "type", "button");
    el.setAttribute("data-media-tooltip", "live");
  }
  onConnect(el) {
    onPress(el, this.#onPress.bind(this));
  }
  #onPress(event) {
    const { disabled } = this.$props, { liveEdge } = this.#media.$state;
    if (disabled() || liveEdge()) return;
    this.#media.remote.seekToLiveEdge(event);
  }
}

class MediaLiveButtonElement extends Host(HTMLElement, LiveButton) {
  static tagName = "media-live-button";
}

let MuteButton$1 = class MuteButton extends Component {
  static props = ToggleButtonController.props;
  #media;
  constructor() {
    super();
    new ToggleButtonController({
      isPresssed: this.#isPressed.bind(this),
      keyShortcut: "toggleMuted",
      onPress: this.#onPress.bind(this)
    });
  }
  onSetup() {
    this.#media = useMediaContext();
    this.setAttributes({
      "data-muted": this.#isPressed.bind(this),
      "data-state": this.#getState.bind(this)
    });
  }
  onAttach(el) {
    el.setAttribute("data-media-mute-button", "");
    el.setAttribute("data-media-tooltip", "mute");
    setARIALabel(el, "Mute");
  }
  #onPress(event) {
    const remote = this.#media.remote;
    this.#isPressed() ? remote.unmute(event) : remote.mute(event);
  }
  #isPressed() {
    const { muted, volume } = this.#media.$state;
    return muted() || volume() === 0;
  }
  #getState() {
    const { muted, volume } = this.#media.$state, $volume = volume();
    if (muted() || $volume === 0) return "muted";
    else if ($volume >= 0.5) return "high";
    else if ($volume < 0.5) return "low";
  }
};

class MediaMuteButtonElement extends Host(HTMLElement, MuteButton$1) {
  static tagName = "media-mute-button";
}

let PIPButton$1 = class PIPButton extends Component {
  static props = ToggleButtonController.props;
  #media;
  constructor() {
    super();
    new ToggleButtonController({
      isPresssed: this.#isPressed.bind(this),
      keyShortcut: "togglePictureInPicture",
      onPress: this.#onPress.bind(this)
    });
  }
  onSetup() {
    this.#media = useMediaContext();
    const { pictureInPicture } = this.#media.$state, isSupported = this.#isSupported.bind(this);
    this.setAttributes({
      "data-active": pictureInPicture,
      "data-supported": isSupported,
      "aria-hidden": $ariaBool(() => !isSupported())
    });
  }
  onAttach(el) {
    el.setAttribute("data-media-tooltip", "pip");
    setARIALabel(el, "PiP");
  }
  #onPress(event) {
    const remote = this.#media.remote;
    this.#isPressed() ? remote.exitPictureInPicture(event) : remote.enterPictureInPicture(event);
  }
  #isPressed() {
    const { pictureInPicture } = this.#media.$state;
    return pictureInPicture();
  }
  #isSupported() {
    const { canPictureInPicture } = this.#media.$state;
    return canPictureInPicture();
  }
};

class MediaPIPButtonElement extends Host(HTMLElement, PIPButton$1) {
  static tagName = "media-pip-button";
}

let PlayButton$1 = class PlayButton extends Component {
  static props = ToggleButtonController.props;
  #media;
  constructor() {
    super();
    new ToggleButtonController({
      isPresssed: this.#isPressed.bind(this),
      keyShortcut: "togglePaused",
      onPress: this.#onPress.bind(this)
    });
  }
  onSetup() {
    this.#media = useMediaContext();
    const { paused, ended } = this.#media.$state;
    this.setAttributes({
      "data-paused": paused,
      "data-ended": ended
    });
  }
  onAttach(el) {
    el.setAttribute("data-media-tooltip", "play");
    setARIALabel(el, "Play");
  }
  #onPress(event) {
    const remote = this.#media.remote;
    this.#isPressed() ? remote.pause(event) : remote.play(event);
  }
  #isPressed() {
    const { paused } = this.#media.$state;
    return !paused();
  }
};

class MediaPlayButtonElement extends Host(HTMLElement, PlayButton$1) {
  static tagName = "media-play-button";
}

class SeekButton extends Component {
  static props = {
    disabled: false,
    seconds: 30
  };
  #media;
  constructor() {
    super();
    new FocusVisibleController();
  }
  onSetup() {
    this.#media = useMediaContext();
    const { seeking } = this.#media.$state, { seconds } = this.$props, isSupported = this.#isSupported.bind(this);
    this.setAttributes({
      seconds,
      "data-seeking": seeking,
      "data-supported": isSupported,
      "aria-hidden": $ariaBool(() => !isSupported())
    });
  }
  onAttach(el) {
    setAttributeIfEmpty(el, "tabindex", "0");
    setAttributeIfEmpty(el, "role", "button");
    setAttributeIfEmpty(el, "type", "button");
    el.setAttribute("data-media-tooltip", "seek");
    setARIALabel(el, this.#getDefaultLabel.bind(this));
  }
  onConnect(el) {
    onPress(el, this.#onPress.bind(this));
  }
  #isSupported() {
    const { canSeek } = this.#media.$state;
    return canSeek();
  }
  #getDefaultLabel() {
    const { seconds } = this.$props;
    return `Seek ${seconds() > 0 ? "forward" : "backward"} ${seconds()} seconds`;
  }
  #onPress(event) {
    const { seconds, disabled } = this.$props;
    if (disabled()) return;
    const { currentTime } = this.#media.$state, seekTo = currentTime() + seconds();
    this.#media.remote.seek(seekTo, event);
  }
}

class MediaSeekButtonElement extends Host(HTMLElement, SeekButton) {
  static tagName = "media-seek-button";
}

class ToggleButton extends Component {
  static props = {
    disabled: false,
    defaultPressed: false
  };
  #pressed = signal(false);
  /**
   * Whether the toggle is currently in a `pressed` state.
   */
  get pressed() {
    return this.#pressed();
  }
  constructor() {
    super();
    new ToggleButtonController({
      isPresssed: this.#pressed
    });
  }
}
const togglebutton__proto = ToggleButton.prototype;
prop(togglebutton__proto, "pressed");

class MediaToggleButtonElement extends Host(HTMLElement, ToggleButton) {
  static tagName = "media-toggle-button";
}

class CaptionsTextRenderer {
  priority = 10;
  #track = null;
  #renderer;
  #events;
  constructor(renderer) {
    this.#renderer = renderer;
  }
  attach() {
  }
  canRender() {
    return true;
  }
  detach() {
    this.#events?.abort();
    this.#events = void 0;
    this.#renderer.reset();
    this.#track = null;
  }
  changeTrack(track) {
    if (!track || this.#track === track) return;
    this.#events?.abort();
    this.#events = new EventsController(track);
    if (track.readyState < 2) {
      this.#renderer.reset();
      this.#events.add("load", () => this.#changeTrack(track), { once: true });
    } else {
      this.#changeTrack(track);
    }
    this.#events.add("add-cue", (event) => {
      this.#renderer.addCue(event.detail);
    }).add("remove-cue", (event) => {
      this.#renderer.removeCue(event.detail);
    });
    this.#track = track;
  }
  #changeTrack(track) {
    this.#renderer.changeTrack({
      cues: [...track.cues],
      regions: [...track.regions]
    });
  }
}

let Captions$1 = class Captions extends Component {
  static props = {
    textDir: "ltr",
    exampleText: "Captions look like this."
  };
  #media;
  static lib = signal(null);
  onSetup() {
    this.#media = useMediaContext();
    this.setAttributes({
      "aria-hidden": $ariaBool(this.#isHidden.bind(this))
    });
  }
  onAttach(el) {
    el.style.setProperty("pointer-events", "none");
  }
  onConnect(el) {
    if (!Captions.lib()) {
      import('https://cdn.vidstack.io/captions').then((lib) => Captions.lib.set(lib));
    }
    effect(this.#watchViewType.bind(this));
  }
  #isHidden() {
    const { textTrack, remotePlaybackState, iOSControls } = this.#media.$state, track = textTrack();
    return iOSControls() || remotePlaybackState() === "connected" || !track || !isTrackCaptionKind(track);
  }
  #watchViewType() {
    if (!Captions.lib()) return;
    const { viewType } = this.#media.$state;
    if (viewType() === "audio") {
      return this.#setupAudioView();
    } else {
      return this.#setupVideoView();
    }
  }
  #setupAudioView() {
    effect(this.#onTrackChange.bind(this));
    this.#listenToFontStyleChanges(null);
    return () => {
      this.el.textContent = "";
    };
  }
  #onTrackChange() {
    if (this.#isHidden()) return;
    this.#onCueChange();
    const { textTrack } = this.#media.$state;
    listenEvent(textTrack(), "cue-change", this.#onCueChange.bind(this));
    effect(this.#onUpdateTimedNodes.bind(this));
  }
  #onCueChange() {
    this.el.textContent = "";
    if (this.#hideExampleTimer >= 0) {
      this.#removeExample();
    }
    const { realCurrentTime, textTrack } = this.#media.$state, { renderVTTCueString } = Captions.lib(), time = peek(realCurrentTime), activeCues = peek(textTrack).activeCues;
    for (const cue of activeCues) {
      const displayEl = this.#createCueDisplayElement(), cueEl = this.#createCueElement();
      cueEl.innerHTML = renderVTTCueString(cue, time);
      displayEl.append(cueEl);
      this.el.append(cueEl);
    }
  }
  #onUpdateTimedNodes() {
    const { realCurrentTime } = this.#media.$state, { updateTimedVTTCueNodes } = Captions.lib();
    updateTimedVTTCueNodes(this.el, realCurrentTime());
  }
  #setupVideoView() {
    const { CaptionsRenderer } = Captions.lib(), renderer = new CaptionsRenderer(this.el), textRenderer = new CaptionsTextRenderer(renderer);
    this.#media.textRenderers.add(textRenderer);
    effect(this.#watchTextDirection.bind(this, renderer));
    effect(this.#watchMediaTime.bind(this, renderer));
    this.#listenToFontStyleChanges(renderer);
    return () => {
      this.el.textContent = "";
      this.#media.textRenderers.remove(textRenderer);
      renderer.destroy();
    };
  }
  #watchTextDirection(renderer) {
    renderer.dir = this.$props.textDir();
  }
  #watchMediaTime(renderer) {
    if (this.#isHidden()) return;
    const { realCurrentTime, textTrack } = this.#media.$state;
    renderer.currentTime = realCurrentTime();
    if (this.#hideExampleTimer >= 0 && textTrack()?.activeCues[0]) {
      this.#removeExample();
    }
  }
  #listenToFontStyleChanges(renderer) {
    const player = this.#media.player;
    if (!player) return;
    const onChange = this.#onFontStyleChange.bind(this, renderer);
    listenEvent(player, "vds-font-change", onChange);
  }
  #onFontStyleChange(renderer) {
    if (this.#hideExampleTimer >= 0) {
      this.#hideExample();
      return;
    }
    const { textTrack } = this.#media.$state;
    if (!textTrack()?.activeCues[0]) {
      this.#showExample();
    } else {
      renderer?.update(true);
    }
  }
  #showExample() {
    const display = this.#createCueDisplayElement();
    setAttribute(display, "data-example", "");
    const cue = this.#createCueElement();
    setAttribute(cue, "data-example", "");
    cue.textContent = this.$props.exampleText();
    display?.append(cue);
    this.el?.append(display);
    this.el?.setAttribute("data-example", "");
    this.#hideExample();
  }
  #hideExampleTimer = -1;
  #hideExample() {
    window.clearTimeout(this.#hideExampleTimer);
    this.#hideExampleTimer = window.setTimeout(this.#removeExample.bind(this), 2500);
  }
  #removeExample() {
    this.el?.removeAttribute("data-example");
    if (this.el?.querySelector("[data-example]")) this.el.textContent = "";
    this.#hideExampleTimer = -1;
  }
  #createCueDisplayElement() {
    const el = document.createElement("div");
    setAttribute(el, "data-part", "cue-display");
    return el;
  }
  #createCueElement() {
    const el = document.createElement("div");
    setAttribute(el, "data-part", "cue");
    return el;
  }
};

class MediaCaptionsElement extends Host(HTMLElement, Captions$1) {
  static tagName = "media-captions";
}

class ChapterTitle extends Component {
  static props = {
    defaultText: ""
  };
}
class MediaChapterTitleElement extends Host(HTMLElement, ChapterTitle) {
  static tagName = "media-chapter-title";
  #media;
  #chapterTitle;
  onSetup() {
    this.#media = useMediaContext();
    this.#chapterTitle = signal("");
  }
  onConnect() {
    const tracks = this.#media.textTracks;
    watchCueTextChange(tracks, "chapters", this.#chapterTitle.set);
    effect(this.#watchChapterTitle.bind(this));
  }
  #watchChapterTitle() {
    const { defaultText } = this.$props;
    this.textContent = this.#chapterTitle() || defaultText();
  }
}

class Controls extends Component {
  static props = {
    hideDelay: 2e3,
    hideOnMouseLeave: false
  };
  #media;
  onSetup() {
    this.#media = useMediaContext();
    effect(this.#watchProps.bind(this));
  }
  onAttach(el) {
    const { pictureInPicture, fullscreen } = this.#media.$state;
    setStyle(el, "pointer-events", "none");
    setAttributeIfEmpty(el, "role", "group");
    this.setAttributes({
      "data-visible": this.#isShowing.bind(this),
      "data-fullscreen": fullscreen,
      "data-pip": pictureInPicture
    });
    effect(() => {
      this.dispatch("change", { detail: this.#isShowing() });
    });
    effect(this.#hideControls.bind(this));
    effect(() => {
      const isFullscreen = fullscreen();
      for (const side of ["top", "right", "bottom", "left"]) {
        setStyle(el, `padding-${side}`, isFullscreen && `env(safe-area-inset-${side})`);
      }
    });
  }
  #hideControls() {
    if (!this.el) return;
    const { nativeControls } = this.#media.$state, isHidden = nativeControls();
    setAttribute(this.el, "aria-hidden", isHidden ? "true" : null);
    setStyle(this.el, "display", isHidden ? "none" : null);
  }
  #watchProps() {
    const { controls } = this.#media.player, { hideDelay, hideOnMouseLeave } = this.$props;
    controls.defaultDelay = hideDelay() === 2e3 ? this.#media.$props.controlsDelay() : hideDelay();
    controls.hideOnMouseLeave = hideOnMouseLeave();
  }
  #isShowing() {
    const { controlsVisible } = this.#media.$state;
    return controlsVisible();
  }
}

class MediaControlsElement extends Host(HTMLElement, Controls) {
  static tagName = "media-controls";
}

class ControlsGroup extends Component {
  onAttach(el) {
    if (!el.style.pointerEvents) setStyle(el, "pointer-events", "auto");
  }
}

class MediaControlsGroupElement extends Host(HTMLElement, ControlsGroup) {
  static tagName = "media-controls-group";
}

class Gesture extends Component {
  static props = {
    disabled: false,
    event: void 0,
    action: void 0
  };
  #media;
  #provider = null;
  onSetup() {
    this.#media = useMediaContext();
    const { event, action } = this.$props;
    this.setAttributes({
      event,
      action
    });
  }
  onAttach(el) {
    el.setAttribute("data-media-gesture", "");
    el.style.setProperty("pointer-events", "none");
  }
  onConnect(el) {
    this.#provider = this.#media.player.el?.querySelector(
      "[data-media-provider]"
    );
    effect(this.#attachListener.bind(this));
  }
  #attachListener() {
    let eventType = this.$props.event(), disabled = this.$props.disabled();
    if (!this.#provider || !eventType || disabled) return;
    if (/^dbl/.test(eventType)) {
      eventType = eventType.split(/^dbl/)[1];
    }
    if (eventType === "pointerup" || eventType === "pointerdown") {
      const pointer = this.#media.$state.pointer();
      if (pointer === "coarse") {
        eventType = eventType === "pointerup" ? "touchend" : "touchstart";
      }
    }
    listenEvent(
      this.#provider,
      eventType,
      this.#acceptEvent.bind(this),
      { passive: false }
    );
  }
  #presses = 0;
  #pressTimerId = -1;
  #acceptEvent(event) {
    if (this.$props.disabled() || isPointerEvent(event) && (event.button !== 0 || this.#media.activeMenu) || isTouchEvent(event) && this.#media.activeMenu || isTouchPinchEvent(event) || !this.#inBounds(event)) {
      return;
    }
    event.MEDIA_GESTURE = true;
    event.preventDefault();
    const eventType = peek(this.$props.event), isDblEvent = eventType?.startsWith("dbl");
    if (!isDblEvent) {
      if (this.#presses === 0) {
        setTimeout(() => {
          if (this.#presses === 1) this.#handleEvent(event);
        }, 250);
      }
    } else if (this.#presses === 1) {
      queueMicrotask(() => this.#handleEvent(event));
      clearTimeout(this.#pressTimerId);
      this.#presses = 0;
      return;
    }
    if (this.#presses === 0) {
      this.#pressTimerId = window.setTimeout(() => {
        this.#presses = 0;
      }, 275);
    }
    this.#presses++;
  }
  #handleEvent(event) {
    this.el.setAttribute("data-triggered", "");
    requestAnimationFrame(() => {
      if (this.#isTopLayer()) {
        this.#performAction(peek(this.$props.action), event);
      }
      requestAnimationFrame(() => {
        this.el.removeAttribute("data-triggered");
      });
    });
  }
  /** Validate event occurred in gesture bounds. */
  #inBounds(event) {
    if (!this.el) return false;
    if (isPointerEvent(event) || isMouseEvent(event) || isTouchEvent(event)) {
      const touch = isTouchEvent(event) ? event.changedTouches[0] ?? event.touches[0] : void 0;
      const clientX = touch?.clientX ?? event.clientX;
      const clientY = touch?.clientY ?? event.clientY;
      const rect = this.el.getBoundingClientRect();
      const inBounds = clientY >= rect.top && clientY <= rect.bottom && clientX >= rect.left && clientX <= rect.right;
      return event.type.includes("leave") ? !inBounds : inBounds;
    }
    return true;
  }
  /** Validate gesture has the highest z-index in this triggered group. */
  #isTopLayer() {
    const gestures = this.#media.player.el.querySelectorAll(
      "[data-media-gesture][data-triggered]"
    );
    return Array.from(gestures).sort(
      (a, b) => +getComputedStyle(b).zIndex - +getComputedStyle(a).zIndex
    )[0] === this.el;
  }
  #performAction(action, trigger) {
    if (!action) return;
    const willTriggerEvent = new DOMEvent("will-trigger", {
      detail: action,
      cancelable: true,
      trigger
    });
    this.dispatchEvent(willTriggerEvent);
    if (willTriggerEvent.defaultPrevented) return;
    const [method, value] = action.replace(/:([a-z])/, "-$1").split(":");
    if (action.includes(":fullscreen")) {
      this.#media.remote.toggleFullscreen("prefer-media", trigger);
    } else if (action.includes("seek:")) {
      this.#media.remote.seek(peek(this.#media.$state.currentTime) + (+value || 0), trigger);
    } else {
      this.#media.remote[kebabToCamelCase(method)](trigger);
    }
    this.dispatch("trigger", {
      detail: action,
      trigger
    });
  }
}

class MediaGestureElement extends Host(HTMLElement, Gesture) {
  static tagName = "media-gesture";
}

class MediaLayout extends Component {
  static props = {
    when: false
  };
}
class MediaLayoutElement extends Host(HTMLElement, MediaLayout) {
  static tagName = "media-layout";
  #media;
  onSetup() {
    this.#media = useMediaContext();
  }
  onConnect() {
    effect(this.#watchWhen.bind(this));
  }
  #watchWhen() {
    const root = this.firstElementChild, isTemplate = root?.localName === "template", when = this.$props.when(), matches = isBoolean(when) ? when : computed(() => when(this.#media.player.state))();
    if (!matches) {
      if (isTemplate) {
        this.textContent = "";
        this.appendChild(root);
      } else if (isHTMLElement(root)) {
        root.style.display = "none";
      }
      return;
    }
    if (isTemplate) {
      this.append(root.content.cloneNode(true));
    } else if (isHTMLElement(root)) {
      root.style.display = "";
    }
  }
}

const menuContext = createContext();

const radioControllerContext = createContext();

class RadioGroupController extends ViewController {
  #group = /* @__PURE__ */ new Set();
  #value = signal("");
  #controller = null;
  onValueChange;
  get values() {
    return Array.from(this.#group).map((radio) => radio.value());
  }
  get value() {
    return this.#value();
  }
  set value(value) {
    this.#onChange(value);
  }
  onSetup() {
    provideContext(radioControllerContext, {
      add: this.#addRadio.bind(this),
      remove: this.#removeRadio.bind(this)
    });
  }
  onAttach(el) {
    const isMenuItem = hasProvidedContext(menuContext);
    if (!isMenuItem) setAttributeIfEmpty(el, "role", "radiogroup");
    this.setAttributes({ value: this.#value });
  }
  onDestroy() {
    this.#group.clear();
  }
  #addRadio(radio) {
    if (this.#group.has(radio)) return;
    this.#group.add(radio);
    radio.onCheck = this.#onChangeBind;
    radio.check(radio.value() === this.#value());
  }
  #removeRadio(radio) {
    radio.onCheck = null;
    this.#group.delete(radio);
  }
  #onChangeBind = this.#onChange.bind(this);
  #onChange(newValue, trigger) {
    const currentValue = peek(this.#value);
    if (!newValue || newValue === currentValue) return;
    const currentRadio = this.#findRadio(currentValue), newRadio = this.#findRadio(newValue);
    currentRadio?.check(false, trigger);
    newRadio?.check(true, trigger);
    this.#value.set(newValue);
    this.onValueChange?.(newValue, trigger);
  }
  #findRadio(newValue) {
    for (const radio of this.#group) {
      if (newValue === peek(radio.value)) return radio;
    }
    return null;
  }
}

const DEFAULT_AUDIO_GAINS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
class AudioGainRadioGroup extends Component {
  static props = {
    normalLabel: "Disabled",
    gains: DEFAULT_AUDIO_GAINS
  };
  #media;
  #menu;
  #controller;
  get value() {
    return this.#controller.value;
  }
  get disabled() {
    const { gains } = this.$props, { canSetAudioGain } = this.#media.$state;
    return !canSetAudioGain() || gains().length === 0;
  }
  constructor() {
    super();
    this.#controller = new RadioGroupController();
    this.#controller.onValueChange = this.#onValueChange.bind(this);
  }
  onSetup() {
    this.#media = useMediaContext();
    if (hasProvidedContext(menuContext)) {
      this.#menu = useContext(menuContext);
    }
  }
  onConnect(el) {
    effect(this.#watchValue.bind(this));
    effect(this.#watchHintText.bind(this));
    effect(this.#watchControllerDisabled.bind(this));
  }
  getOptions() {
    const { gains, normalLabel } = this.$props;
    return gains().map((gain) => ({
      label: gain === 1 || gain === null ? normalLabel : String(gain * 100) + "%",
      value: gain.toString()
    }));
  }
  #watchValue() {
    this.#controller.value = this.#getValue();
  }
  #watchHintText() {
    const { normalLabel } = this.$props, { audioGain } = this.#media.$state, gain = audioGain();
    this.#menu?.hint.set(gain === 1 || gain == null ? normalLabel() : String(gain * 100) + "%");
  }
  #watchControllerDisabled() {
    this.#menu?.disable(this.disabled);
  }
  #getValue() {
    const { audioGain } = this.#media.$state;
    return audioGain()?.toString() ?? "1";
  }
  #onValueChange(value, trigger) {
    if (this.disabled) return;
    const gain = +value;
    this.#media.remote.changeAudioGain(gain, trigger);
    this.dispatch("change", { detail: gain, trigger });
  }
}
const audiogainradiogroup__proto = AudioGainRadioGroup.prototype;
prop(audiogainradiogroup__proto, "value");
prop(audiogainradiogroup__proto, "disabled");
method(audiogainradiogroup__proto, "getOptions");

function renderMenuItemsTemplate(el, onCreate) {
  requestScopedAnimationFrame(() => {
    if (!el.connectScope) return;
    const template = el.querySelector("template");
    if (!template) return;
    effect(() => {
      if (!template.content.firstElementChild?.localName && !template.firstElementChild) {
        throw Error("[vidstack] menu items template requires root element");
      }
      const options = el.getOptions();
      cloneTemplate(template, options.length, (radio, i) => {
        const { label, value } = options[i], labelEl = radio.querySelector(`[data-part="label"]`);
        radio.setAttribute("value", value);
        if (labelEl) {
          if (isString(label)) {
            labelEl.textContent = label;
          } else {
            effect(() => {
              labelEl.textContent = label();
            });
          }
        }
        onCreate?.(radio, options[i], i);
      });
    });
  });
}

class MediaAudioGainRadioGroupElement extends Host(HTMLElement, AudioGainRadioGroup) {
  static tagName = "media-audio-gain-radio-group";
  onConnect() {
    renderMenuItemsTemplate(this);
  }
}

let AudioRadioGroup$1 = class AudioRadioGroup extends Component {
  static props = {
    emptyLabel: "Default"
  };
  #menu;
  #media;
  #controller;
  get value() {
    return this.#controller.value;
  }
  get disabled() {
    const { audioTracks } = this.#media.$state;
    return audioTracks().length <= 1;
  }
  constructor() {
    super();
    this.#controller = new RadioGroupController();
    this.#controller.onValueChange = this.#onValueChange.bind(this);
  }
  onSetup() {
    this.#media = useMediaContext();
    if (hasProvidedContext(menuContext)) {
      this.#menu = useContext(menuContext);
    }
  }
  onConnect(el) {
    effect(this.#watchValue.bind(this));
    effect(this.#watchControllerDisabled.bind(this));
    effect(this.#watchHintText.bind(this));
  }
  getOptions() {
    const { audioTracks } = this.#media.$state;
    return audioTracks().map((track) => ({
      track,
      label: track.label,
      value: track.label.toLowerCase()
    }));
  }
  #watchValue() {
    this.#controller.value = this.#getValue();
  }
  #watchHintText() {
    const { emptyLabel } = this.$props, { audioTrack } = this.#media.$state, track = audioTrack();
    this.#menu?.hint.set(track?.label ?? emptyLabel());
  }
  #watchControllerDisabled() {
    this.#menu?.disable(this.disabled);
  }
  #getValue() {
    const { audioTrack } = this.#media.$state;
    const track = audioTrack();
    return track ? track.label.toLowerCase() : "";
  }
  #onValueChange(value, trigger) {
    if (this.disabled) return;
    const index = this.#media.audioTracks.toArray().findIndex((track) => track.label.toLowerCase() === value);
    if (index >= 0) {
      const track = this.#media.audioTracks[index];
      this.#media.remote.changeAudioTrack(index, trigger);
      this.dispatch("change", { detail: track, trigger });
    }
  }
};
const audioradiogroup__proto = AudioRadioGroup$1.prototype;
prop(audioradiogroup__proto, "value");
prop(audioradiogroup__proto, "disabled");
method(audioradiogroup__proto, "getOptions");

class MediaAudioRadioGroupElement extends Host(HTMLElement, AudioRadioGroup$1) {
  static tagName = "media-audio-radio-group";
  onConnect() {
    renderMenuItemsTemplate(this);
  }
}

let CaptionsRadioGroup$1 = class CaptionsRadioGroup extends Component {
  static props = {
    offLabel: "Off"
  };
  #media;
  #menu;
  #controller;
  get value() {
    return this.#controller.value;
  }
  get disabled() {
    const { hasCaptions } = this.#media.$state;
    return !hasCaptions();
  }
  constructor() {
    super();
    this.#controller = new RadioGroupController();
    this.#controller.onValueChange = this.#onValueChange.bind(this);
  }
  onSetup() {
    this.#media = useMediaContext();
    if (hasProvidedContext(menuContext)) {
      this.#menu = useContext(menuContext);
    }
  }
  onConnect(el) {
    super.onConnect?.(el);
    effect(this.#watchValue.bind(this));
    effect(this.#watchControllerDisabled.bind(this));
    effect(this.#watchHintText.bind(this));
  }
  getOptions() {
    const { offLabel } = this.$props, { textTracks } = this.#media.$state;
    return [
      { value: "off", label: offLabel },
      ...textTracks().filter(isTrackCaptionKind).map((track) => ({
        track,
        label: track.label,
        value: this.#getTrackValue(track)
      }))
    ];
  }
  #watchValue() {
    this.#controller.value = this.#getValue();
  }
  #watchHintText() {
    const { offLabel } = this.$props, { textTrack } = this.#media.$state, track = textTrack();
    this.#menu?.hint.set(
      track && isTrackCaptionKind(track) && track.mode === "showing" ? track.label : offLabel()
    );
  }
  #watchControllerDisabled() {
    this.#menu?.disable(this.disabled);
  }
  #getValue() {
    const { textTrack } = this.#media.$state, track = textTrack();
    return track && isTrackCaptionKind(track) && track.mode === "showing" ? this.#getTrackValue(track) : "off";
  }
  #onValueChange(value, trigger) {
    if (this.disabled) return;
    if (value === "off") {
      const track = this.#media.textTracks.selected;
      if (track) {
        const index2 = this.#media.textTracks.indexOf(track);
        this.#media.remote.changeTextTrackMode(index2, "disabled", trigger);
        this.dispatch("change", { detail: null, trigger });
      }
      return;
    }
    const index = this.#media.textTracks.toArray().findIndex((track) => this.#getTrackValue(track) === value);
    if (index >= 0) {
      const track = this.#media.textTracks[index];
      this.#media.remote.changeTextTrackMode(index, "showing", trigger);
      this.dispatch("change", { detail: track, trigger });
    }
  }
  #getTrackValue(track) {
    return track.id + ":" + track.kind + "-" + track.label.toLowerCase();
  }
};
const captionsradiogroup__proto = CaptionsRadioGroup$1.prototype;
prop(captionsradiogroup__proto, "value");
prop(captionsradiogroup__proto, "disabled");
method(captionsradiogroup__proto, "getOptions");

class MediaCaptionsRadioGroupElement extends Host(HTMLElement, CaptionsRadioGroup$1) {
  static tagName = "media-captions-radio-group";
  onConnect() {
    renderMenuItemsTemplate(this);
  }
}

var __defProp$1 = Object.defineProperty;
var __getOwnPropDesc$1 = Object.getOwnPropertyDescriptor;
var __decorateClass$1 = (decorators, target, key, kind) => {
  var result = __getOwnPropDesc$1(target, key) ;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (decorator(target, key, result) ) || result;
  if (result) __defProp$1(target, key, result);
  return result;
};
class ChaptersRadioGroup extends Component {
  static props = {
    thumbnails: null
  };
  #media;
  #menu;
  #controller;
  #track = signal(null);
  #cues = signal([]);
  get value() {
    return this.#controller.value;
  }
  get disabled() {
    return !this.#cues()?.length;
  }
  constructor() {
    super();
    this.#controller = new RadioGroupController();
    this.#controller.onValueChange = this.#onValueChange.bind(this);
  }
  onSetup() {
    this.#media = useMediaContext();
    if (hasProvidedContext(menuContext)) {
      this.#menu = useContext(menuContext);
    }
    const { thumbnails } = this.$props;
    this.setAttributes({
      "data-thumbnails": () => !!thumbnails()
    });
  }
  onAttach(el) {
    this.#menu?.attachObserver({
      onOpen: this.#onOpen.bind(this)
    });
  }
  getOptions() {
    const { seekableStart, seekableEnd } = this.#media.$state, startTime = seekableStart(), endTime = seekableEnd();
    return this.#cues().map((cue, i) => ({
      cue,
      value: i.toString(),
      label: cue.text,
      startTime: formatTime(Math.max(0, cue.startTime - startTime)),
      duration: formatSpokenTime(
        Math.min(endTime, cue.endTime) - Math.max(startTime, cue.startTime)
      )
    }));
  }
  #onOpen() {
    peek(() => this.#watchCurrentTime());
  }
  onConnect(el) {
    effect(this.#watchCurrentTime.bind(this));
    effect(this.#watchControllerDisabled.bind(this));
    effect(this.#watchTrack.bind(this));
    watchActiveTextTrack(this.#media.textTracks, "chapters", this.#track.set);
  }
  #watchTrack() {
    const track = this.#track();
    if (!track) return;
    const onCuesChange = this.#onCuesChange.bind(this, track);
    onCuesChange();
    new EventsController(track).add("add-cue", onCuesChange).add("remove-cue", onCuesChange);
    return () => {
      this.#cues.set([]);
    };
  }
  #onCuesChange(track) {
    const { seekableStart, seekableEnd } = this.#media.$state, startTime = seekableStart(), endTime = seekableEnd();
    this.#cues.set(
      [...track.cues].filter((cue) => cue.startTime <= endTime && cue.endTime >= startTime)
    );
  }
  #watchCurrentTime() {
    if (!this.#menu?.expanded()) return;
    const track = this.#track();
    if (!track) {
      this.#controller.value = "-1";
      return;
    }
    const { realCurrentTime, seekableStart, seekableEnd } = this.#media.$state, startTime = seekableStart(), endTime = seekableEnd(), time = realCurrentTime(), activeCueIndex = this.#cues().findIndex((cue) => isCueActive(cue, time));
    this.#controller.value = activeCueIndex.toString();
    if (activeCueIndex >= 0) {
      requestScopedAnimationFrame(() => {
        if (!this.connectScope) return;
        const cue = this.#cues()[activeCueIndex], radio = this.el.querySelector(`[aria-checked='true']`), cueStartTime = Math.max(startTime, cue.startTime), duration = Math.min(endTime, cue.endTime) - cueStartTime, playedPercent = Math.max(0, time - cueStartTime) / duration * 100;
        radio && setStyle(radio, "--progress", round(playedPercent, 3) + "%");
      });
    }
  }
  #watchControllerDisabled() {
    this.#menu?.disable(this.disabled);
  }
  #onValueChange(value, trigger) {
    if (this.disabled || !trigger) return;
    const index = +value, cues = this.#cues(), { clipStartTime } = this.#media.$state;
    if (isNumber(index) && cues?.[index]) {
      this.#controller.value = index.toString();
      this.#media.remote.seek(cues[index].startTime - clipStartTime(), trigger);
      this.dispatch("change", { detail: cues[index], trigger });
    }
  }
}
__decorateClass$1([
  prop
], ChaptersRadioGroup.prototype, "value");
__decorateClass$1([
  prop
], ChaptersRadioGroup.prototype, "disabled");
__decorateClass$1([
  method
], ChaptersRadioGroup.prototype, "getOptions");

class MediaChaptersRadioGroupElement extends Host(HTMLElement, ChaptersRadioGroup) {
  static tagName = "media-chapters-radio-group";
  onConnect() {
    renderMenuItemsTemplate(this, (el, option) => {
      const { cue, startTime, duration } = option, thumbnailEl = el.querySelector(".vds-thumbnail,media-thumbnail"), startEl = el.querySelector('[data-part="start-time"]'), durationEl = el.querySelector('[data-part="duration"]');
      if (startEl) startEl.textContent = startTime;
      if (durationEl) durationEl.textContent = duration;
      if (thumbnailEl) {
        thumbnailEl.setAttribute("time", cue.startTime + "");
        effect(() => {
          const thumbnails = this.$props.thumbnails();
          if ("src" in thumbnailEl) {
            thumbnailEl.src = thumbnails;
          } else if (isString(thumbnails)) {
            thumbnailEl.setAttribute("src", thumbnails);
          }
        });
      }
    });
  }
}

let MenuButton$1 = class MenuButton extends Component {
  static props = {
    disabled: false
  };
  #menu;
  #hintEl = signal(null);
  get expanded() {
    return this.#menu?.expanded() ?? false;
  }
  constructor() {
    super();
    new FocusVisibleController();
  }
  onSetup() {
    this.#menu = useContext(menuContext);
  }
  onAttach(el) {
    this.#menu.attachMenuButton(this);
    effect(this.#watchDisabled.bind(this));
    setAttributeIfEmpty(el, "type", "button");
  }
  onConnect(el) {
    effect(this.#watchHintEl.bind(this));
    this.#onMutation();
    const mutations = new MutationObserver(this.#onMutation.bind(this));
    mutations.observe(el, { attributeFilter: ["data-part"], childList: true, subtree: true });
    onDispose(() => mutations.disconnect());
    onPress(el, (trigger) => {
      this.dispatch("select", { trigger });
    });
  }
  #watchDisabled() {
    this.#menu.disableMenuButton(this.$props.disabled());
  }
  #watchHintEl() {
    const el = this.#hintEl();
    if (!el) return;
    effect(() => {
      const text = this.#menu.hint();
      if (text) el.textContent = text;
    });
  }
  #onMutation() {
    const hintEl = this.el?.querySelector('[data-part="hint"]');
    this.#hintEl.set(hintEl ?? null);
  }
};
const menubutton__proto = MenuButton$1.prototype;
prop(menubutton__proto, "expanded");

class MediaMenuButtonElement extends Host(HTMLElement, MenuButton$1) {
  static tagName = "media-menu-button";
}

class Popper extends ViewController {
  #delegate;
  constructor(delegate) {
    super();
    this.#delegate = delegate;
    effect(this.#watchTrigger.bind(this));
  }
  onDestroy() {
    this.#stopAnimationEndListener?.();
    this.#stopAnimationEndListener = null;
  }
  #watchTrigger() {
    const trigger = this.#delegate.trigger();
    if (!trigger) {
      this.hide();
      return;
    }
    const show = this.show.bind(this), hide = this.hide.bind(this);
    this.#delegate.listen(trigger, show, hide);
  }
  #showTimerId = -1;
  #hideRafId = -1;
  #stopAnimationEndListener = null;
  show(trigger) {
    this.#cancelShowing();
    window.cancelAnimationFrame(this.#hideRafId);
    this.#hideRafId = -1;
    this.#stopAnimationEndListener?.();
    this.#stopAnimationEndListener = null;
    this.#showTimerId = window.setTimeout(() => {
      this.#showTimerId = -1;
      const content = this.#delegate.content();
      if (content) content.style.removeProperty("display");
      peek(() => this.#delegate.onChange(true, trigger));
    }, this.#delegate.showDelay?.() ?? 0);
  }
  hide(trigger) {
    this.#cancelShowing();
    peek(() => this.#delegate.onChange(false, trigger));
    this.#hideRafId = requestAnimationFrame(() => {
      this.#cancelShowing();
      this.#hideRafId = -1;
      const content = this.#delegate.content();
      if (content) {
        const onHide = () => {
          content.style.display = "none";
          this.#stopAnimationEndListener = null;
        };
        const isAnimated = hasAnimation(content);
        if (isAnimated) {
          this.#stopAnimationEndListener?.();
          const stop = listenEvent(content, "animationend", onHide, { once: true });
          this.#stopAnimationEndListener = stop;
        } else {
          onHide();
        }
      }
    });
  }
  #cancelShowing() {
    window.clearTimeout(this.#showTimerId);
    this.#showTimerId = -1;
  }
}

const sliderContext = createContext();
const sliderObserverContext = createContext();

const t = (t2) => "object" == typeof t2 && null != t2 && 1 === t2.nodeType, e = (t2, e2) => (!e2 || "hidden" !== t2) && ("visible" !== t2 && "clip" !== t2), n = (t2, n2) => {
  if (t2.clientHeight < t2.scrollHeight || t2.clientWidth < t2.scrollWidth) {
    const o2 = getComputedStyle(t2, null);
    return e(o2.overflowY, n2) || e(o2.overflowX, n2) || ((t3) => {
      const e2 = ((t4) => {
        if (!t4.ownerDocument || !t4.ownerDocument.defaultView) return null;
        try {
          return t4.ownerDocument.defaultView.frameElement;
        } catch (t5) {
          return null;
        }
      })(t3);
      return !!e2 && (e2.clientHeight < t3.scrollHeight || e2.clientWidth < t3.scrollWidth);
    })(t2);
  }
  return false;
}, o = (t2, e2, n2, o2, l2, r2, i, s) => r2 < t2 && i > e2 || r2 > t2 && i < e2 ? 0 : r2 <= t2 && s <= n2 || i >= e2 && s >= n2 ? r2 - t2 - o2 : i > e2 && s < n2 || r2 < t2 && s > n2 ? i - e2 + l2 : 0, l = (t2) => {
  const e2 = t2.parentElement;
  return null == e2 ? t2.getRootNode().host || null : e2;
}, r = (e2, r2) => {
  var i, s, d, h;
  if ("undefined" == typeof document) return [];
  const { scrollMode: c, block: f, inline: u, boundary: a, skipOverflowHiddenElements: g } = r2, p = "function" == typeof a ? a : (t2) => t2 !== a;
  if (!t(e2)) throw new TypeError("Invalid target");
  const m = document.scrollingElement || document.documentElement, w = [];
  let W = e2;
  for (; t(W) && p(W); ) {
    if (W = l(W), W === m) {
      w.push(W);
      break;
    }
    null != W && W === document.body && n(W) && !n(document.documentElement) || null != W && n(W, g) && w.push(W);
  }
  const b = null != (s = null == (i = window.visualViewport) ? void 0 : i.width) ? s : innerWidth, H = null != (h = null == (d = window.visualViewport) ? void 0 : d.height) ? h : innerHeight, { scrollX: y, scrollY: M } = window, { height: v, width: E, top: x, right: C, bottom: I, left: R } = e2.getBoundingClientRect(), { top: T, right: B, bottom: F, left: V } = ((t2) => {
    const e3 = window.getComputedStyle(t2);
    return { top: parseFloat(e3.scrollMarginTop) || 0, right: parseFloat(e3.scrollMarginRight) || 0, bottom: parseFloat(e3.scrollMarginBottom) || 0, left: parseFloat(e3.scrollMarginLeft) || 0 };
  })(e2);
  let k = "start" === f || "nearest" === f ? x - T : "end" === f ? I + F : x + v / 2 - T + F, D = "center" === u ? R + E / 2 - V + B : "end" === u ? C + B : R - V;
  const L = [];
  for (let t2 = 0; t2 < w.length; t2++) {
    const e3 = w[t2], { height: n2, width: l2, top: r3, right: i2, bottom: s2, left: d2 } = e3.getBoundingClientRect();
    if ("if-needed" === c && x >= 0 && R >= 0 && I <= H && C <= b && x >= r3 && I <= s2 && R >= d2 && C <= i2) return L;
    const h2 = getComputedStyle(e3), a2 = parseInt(h2.borderLeftWidth, 10), g2 = parseInt(h2.borderTopWidth, 10), p2 = parseInt(h2.borderRightWidth, 10), W2 = parseInt(h2.borderBottomWidth, 10);
    let T2 = 0, B2 = 0;
    const F2 = "offsetWidth" in e3 ? e3.offsetWidth - e3.clientWidth - a2 - p2 : 0, V2 = "offsetHeight" in e3 ? e3.offsetHeight - e3.clientHeight - g2 - W2 : 0, S = "offsetWidth" in e3 ? 0 === e3.offsetWidth ? 0 : l2 / e3.offsetWidth : 0, X = "offsetHeight" in e3 ? 0 === e3.offsetHeight ? 0 : n2 / e3.offsetHeight : 0;
    if (m === e3) T2 = "start" === f ? k : "end" === f ? k - H : "nearest" === f ? o(M, M + H, H, g2, W2, M + k, M + k + v, v) : k - H / 2, B2 = "start" === u ? D : "center" === u ? D - b / 2 : "end" === u ? D - b : o(y, y + b, b, a2, p2, y + D, y + D + E, E), T2 = Math.max(0, T2 + M), B2 = Math.max(0, B2 + y);
    else {
      T2 = "start" === f ? k - r3 - g2 : "end" === f ? k - s2 + W2 + V2 : "nearest" === f ? o(r3, s2, n2, g2, W2 + V2, k, k + v, v) : k - (r3 + n2 / 2) + V2 / 2, B2 = "start" === u ? D - d2 - a2 : "center" === u ? D - (d2 + l2 / 2) + F2 / 2 : "end" === u ? D - i2 + p2 + F2 : o(d2, i2, l2, a2, p2 + F2, D, D + E, E);
      const { scrollLeft: t3, scrollTop: h3 } = e3;
      T2 = 0 === X ? 0 : Math.max(0, Math.min(h3 + T2 / X, e3.scrollHeight - n2 / X + V2)), B2 = 0 === S ? 0 : Math.max(0, Math.min(t3 + B2 / S, e3.scrollWidth - l2 / S + F2)), k += h3 - T2, D += t3 - B2;
    }
    L.push({ el: e3, top: T2, left: B2 });
  }
  return L;
};

function scrollIntoView(el, options) {
  const scrolls = r(el, options);
  for (const { el: el2, top, left } of scrolls) {
    el2.scroll({ top, left, behavior: options.behavior });
  }
}
function scrollIntoCenter(el, options = {}) {
  scrollIntoView(el, {
    scrollMode: "if-needed",
    block: "center",
    inline: "center",
    ...options
  });
}

const FOCUSABLE_ELEMENTS_SELECTOR = /* @__PURE__ */ [
  "a[href]",
  "[tabindex]",
  "input",
  "select",
  "button"
].map((selector) => `${selector}:not([aria-hidden='true'])`).join(",");
const VALID_KEYS = /* @__PURE__ */ new Set([
  "Escape",
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "PageUp",
  "End",
  "PageDown",
  "Enter",
  " "
]);
class MenuFocusController {
  #index = -1;
  #el = null;
  #elements = [];
  #delegate;
  get items() {
    return this.#elements;
  }
  constructor(delegate) {
    this.#delegate = delegate;
  }
  attachMenu(el) {
    listenEvent(el, "focus", this.#onFocus.bind(this));
    this.#el = el;
    onDispose(() => {
      this.#el = null;
    });
  }
  listen() {
    if (!this.#el) return;
    this.update();
    new EventsController(this.#el).add("keyup", this.#onKeyUp.bind(this)).add("keydown", this.#onKeyDown.bind(this));
    onDispose(() => {
      this.#index = -1;
      this.#elements = [];
    });
  }
  update() {
    this.#index = 0;
    this.#elements = this.#getFocusableElements();
  }
  scroll(index = this.#findActiveIndex()) {
    const element = this.#elements[index];
    if (element) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollIntoCenter(element, {
            behavior: "smooth",
            boundary: (el) => {
              return !el.hasAttribute("data-root");
            }
          });
        });
      });
    }
  }
  focusActive(scroll = true) {
    const index = this.#findActiveIndex();
    this.#focusAt(index >= 0 ? index : 0, scroll);
  }
  #focusAt(index, scroll = true) {
    this.#index = index;
    if (this.#elements[index]) {
      this.#elements[index].focus({ preventScroll: true });
      if (scroll) this.scroll(index);
    } else {
      this.#el?.focus({ preventScroll: true });
    }
  }
  #findActiveIndex() {
    return this.#elements.findIndex(
      (el) => document.activeElement === el || el.getAttribute("role") === "menuitemradio" && el.getAttribute("aria-checked") === "true"
    );
  }
  #onFocus() {
    if (this.#index >= 0) return;
    this.update();
    this.focusActive();
  }
  #validateKeyEvent(event) {
    const el = event.target;
    if (wasEnterKeyPressed(event) && el instanceof Element) {
      const role = el.getAttribute("role");
      return !/a|input|select|button/.test(el.localName) && !role;
    }
    return VALID_KEYS.has(event.key);
  }
  #onKeyUp(event) {
    if (!this.#validateKeyEvent(event)) return;
    event.stopPropagation();
    event.preventDefault();
  }
  #onKeyDown(event) {
    if (!this.#validateKeyEvent(event)) return;
    event.stopPropagation();
    event.preventDefault();
    switch (event.key) {
      case "Escape":
        this.#delegate.closeMenu(event);
        break;
      case "Tab":
        this.#focusAt(this.#nextIndex(event.shiftKey ? -1 : 1));
        break;
      case "ArrowUp":
        this.#focusAt(this.#nextIndex(-1));
        break;
      case "ArrowDown":
        this.#focusAt(this.#nextIndex(1));
        break;
      case "Home":
      case "PageUp":
        this.#focusAt(0);
        break;
      case "End":
      case "PageDown":
        this.#focusAt(this.#elements.length - 1);
        break;
    }
  }
  #nextIndex(delta) {
    let index = this.#index;
    do {
      index = (index + delta + this.#elements.length) % this.#elements.length;
    } while (this.#elements[index]?.offsetParent === null);
    return index;
  }
  #getFocusableElements() {
    if (!this.#el) return [];
    const focusableElements = this.#el.querySelectorAll(FOCUSABLE_ELEMENTS_SELECTOR), elements = [];
    const is = (node) => {
      return node.getAttribute("role") === "menu";
    };
    for (const el of focusableElements) {
      if (isHTMLElement(el) && el.offsetParent !== null && // does not have display: none
      isElementParent(this.#el, el, is)) {
        elements.push(el);
      }
    }
    return elements;
  }
}

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = __getOwnPropDesc(target, key) ;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (decorator(target, key, result) ) || result;
  if (result) __defProp(target, key, result);
  return result;
};
let idCount = 0;
let Menu$1 = class Menu extends Component {
  static props = {
    showDelay: 0
  };
  #media;
  #menuId;
  #menuButtonId;
  #expanded = signal(false);
  #disabled = signal(false);
  #trigger = signal(null);
  #content = signal(null);
  #parentMenu;
  #submenus = /* @__PURE__ */ new Set();
  #menuObserver = null;
  #popper;
  #focus;
  #isSliderActive = false;
  #isTriggerDisabled = signal(false);
  #transitionCallbacks = /* @__PURE__ */ new Set();
  get triggerElement() {
    return this.#trigger();
  }
  get contentElement() {
    return this.#content();
  }
  get isSubmenu() {
    return !!this.#parentMenu;
  }
  constructor() {
    super();
    const { showDelay } = this.$props;
    this.#popper = new Popper({
      trigger: this.#trigger,
      content: this.#content,
      showDelay,
      listen: (trigger, show, hide) => {
        onPress(trigger, (event) => {
          if (this.#expanded()) hide(event);
          else show(event);
        });
        const closeTarget = this.#getCloseTarget();
        if (closeTarget) {
          onPress(closeTarget, (event) => {
            event.stopPropagation();
            hide(event);
          });
        }
      },
      onChange: this.#onExpandedChange.bind(this)
    });
  }
  onSetup() {
    this.#media = useMediaContext();
    const currentIdCount = ++idCount;
    this.#menuId = `media-menu-${currentIdCount}`;
    this.#menuButtonId = `media-menu-button-${currentIdCount}`;
    this.#focus = new MenuFocusController({
      closeMenu: this.close.bind(this)
    });
    if (hasProvidedContext(menuContext)) {
      this.#parentMenu = useContext(menuContext);
    }
    this.#observeSliders();
    this.setAttributes({
      "data-open": this.#expanded,
      "data-root": !this.isSubmenu,
      "data-submenu": this.isSubmenu,
      "data-disabled": this.#isDisabled.bind(this)
    });
    provideContext(menuContext, {
      button: this.#trigger,
      content: this.#content,
      expanded: this.#expanded,
      hint: signal(""),
      submenu: !!this.#parentMenu,
      disable: this.#disable.bind(this),
      attachMenuButton: this.#attachMenuButton.bind(this),
      attachMenuItems: this.#attachMenuItems.bind(this),
      attachObserver: this.#attachObserver.bind(this),
      disableMenuButton: this.#disableMenuButton.bind(this),
      addSubmenu: this.#addSubmenu.bind(this),
      onTransitionEvent: (callback) => {
        this.#transitionCallbacks.add(callback);
        onDispose(() => {
          this.#transitionCallbacks.delete(callback);
        });
      }
    });
  }
  onAttach(el) {
    el.style.setProperty("display", "contents");
  }
  onConnect(el) {
    effect(this.#watchExpanded.bind(this));
    if (this.isSubmenu) {
      this.#parentMenu?.addSubmenu(this);
    }
  }
  onDestroy() {
    this.#trigger.set(null);
    this.#content.set(null);
    this.#menuObserver = null;
    this.#transitionCallbacks.clear();
  }
  #observeSliders() {
    let sliderActiveTimer = -1, parentSliderObserver = hasProvidedContext(sliderObserverContext) ? useContext(sliderObserverContext) : null;
    provideContext(sliderObserverContext, {
      onDragStart: () => {
        parentSliderObserver?.onDragStart?.();
        window.clearTimeout(sliderActiveTimer);
        sliderActiveTimer = -1;
        this.#isSliderActive = true;
      },
      onDragEnd: () => {
        parentSliderObserver?.onDragEnd?.();
        sliderActiveTimer = window.setTimeout(() => {
          this.#isSliderActive = false;
          sliderActiveTimer = -1;
        }, 300);
      }
    });
  }
  #watchExpanded() {
    const expanded = this.#isExpanded();
    if (!this.isSubmenu) this.#onResize();
    this.#updateMenuItemsHidden(expanded);
    if (!expanded) return;
    effect(() => {
      const { height } = this.#media.$state, content = this.#content();
      content && setStyle(content, "--player-height", height() + "px");
    });
    this.#focus.listen();
    this.listen("pointerup", this.#onPointerUp.bind(this));
    listenEvent(window, "pointerup", this.#onWindowPointerUp.bind(this));
  }
  #attachMenuButton(button) {
    const el = button.el, isMenuItem = this.isSubmenu, isARIADisabled = $ariaBool(this.#isDisabled.bind(this));
    setAttributeIfEmpty(el, "tabindex", isMenuItem ? "-1" : "0");
    setAttributeIfEmpty(el, "role", isMenuItem ? "menuitem" : "button");
    setAttribute(el, "id", this.#menuButtonId);
    setAttribute(el, "aria-haspopup", "menu");
    setAttribute(el, "aria-expanded", "false");
    setAttribute(el, "data-root", !this.isSubmenu);
    setAttribute(el, "data-submenu", this.isSubmenu);
    const watchAttrs = () => {
      setAttribute(el, "data-open", this.#expanded());
      setAttribute(el, "aria-disabled", isARIADisabled());
    };
    effect(watchAttrs);
    this.#trigger.set(el);
    onDispose(() => {
      this.#trigger.set(null);
    });
  }
  #attachMenuItems(items) {
    const el = items.el;
    el.style.setProperty("display", "none");
    setAttribute(el, "id", this.#menuId);
    setAttributeIfEmpty(el, "role", "menu");
    setAttributeIfEmpty(el, "tabindex", "-1");
    setAttribute(el, "data-root", !this.isSubmenu);
    setAttribute(el, "data-submenu", this.isSubmenu);
    this.#content.set(el);
    onDispose(() => this.#content.set(null));
    const watchAttrs = () => setAttribute(el, "data-open", this.#expanded());
    effect(watchAttrs);
    this.#focus.attachMenu(el);
    this.#updateMenuItemsHidden(false);
    const onTransition = this.#onResizeTransition.bind(this);
    if (!this.isSubmenu) {
      items.listen("transitionstart", onTransition);
      items.listen("transitionend", onTransition);
      items.listen("animationend", this.#onResize);
      items.listen("vds-menu-resize", this.#onResize);
    } else {
      this.#parentMenu?.onTransitionEvent(onTransition);
    }
  }
  #attachObserver(observer) {
    this.#menuObserver = observer;
  }
  #updateMenuItemsHidden(expanded) {
    const content = peek(this.#content);
    if (content) setAttribute(content, "aria-hidden", ariaBool$1(!expanded));
  }
  #disableMenuButton(disabled) {
    this.#isTriggerDisabled.set(disabled);
  }
  #wasKeyboardExpand = false;
  #onExpandedChange(isExpanded, event) {
    this.#wasKeyboardExpand = isKeyboardEvent(event);
    event?.stopPropagation();
    if (this.#expanded() === isExpanded) return;
    if (this.#isDisabled()) {
      if (isExpanded) this.#popper.hide(event);
      return;
    }
    this.el?.dispatchEvent(
      new Event("vds-menu-resize", {
        bubbles: true,
        composed: true
      })
    );
    const trigger = this.#trigger(), content = this.#content();
    if (trigger) {
      setAttribute(trigger, "aria-controls", isExpanded && this.#menuId);
      setAttribute(trigger, "aria-expanded", ariaBool$1(isExpanded));
    }
    if (content) setAttribute(content, "aria-labelledby", isExpanded && this.#menuButtonId);
    this.#expanded.set(isExpanded);
    this.#toggleMediaControls(event);
    tick();
    if (this.#wasKeyboardExpand) {
      if (isExpanded) content?.focus();
      else trigger?.focus();
      for (const el of [this.el, content]) {
        el && el.setAttribute("data-keyboard", "");
      }
    } else {
      for (const el of [this.el, content]) {
        el && el.removeAttribute("data-keyboard");
      }
    }
    this.dispatch(isExpanded ? "open" : "close", { trigger: event });
    if (isExpanded) {
      if (!this.isSubmenu && this.#media.activeMenu !== this) {
        this.#media.activeMenu?.close(event);
        this.#media.activeMenu = this;
      }
      this.#menuObserver?.onOpen?.(event);
    } else {
      if (this.isSubmenu) {
        for (const el of this.#submenus) el.close(event);
      } else {
        this.#media.activeMenu = null;
      }
      this.#menuObserver?.onClose?.(event);
    }
    if (isExpanded) {
      requestAnimationFrame(this.#updateFocus.bind(this));
    }
  }
  #updateFocus() {
    if (this.#isTransitionActive || this.#isSubmenuOpen) return;
    this.#focus.update();
    requestAnimationFrame(() => {
      if (this.#wasKeyboardExpand) {
        this.#focus.focusActive();
      } else {
        this.#focus.scroll();
      }
    });
  }
  #isExpanded() {
    return !this.#isDisabled() && this.#expanded();
  }
  #isDisabled() {
    return this.#disabled() || this.#isTriggerDisabled();
  }
  #disable(disabled) {
    this.#disabled.set(disabled);
  }
  #onPointerUp(event) {
    const content = this.#content();
    if (this.#isSliderActive || content && isEventInside(content, event)) {
      return;
    }
    event.stopPropagation();
  }
  #onWindowPointerUp(event) {
    const content = this.#content();
    if (this.#isSliderActive || content && isEventInside(content, event)) {
      return;
    }
    this.close(event);
  }
  #getCloseTarget() {
    const target = this.el?.querySelector('[data-part="close-target"]');
    return this.el && target && isElementParent(this.el, target, (node) => node.getAttribute("role") === "menu") ? target : null;
  }
  #toggleMediaControls(trigger) {
    if (this.isSubmenu) return;
    if (this.#expanded()) this.#media.remote.pauseControls(trigger);
    else this.#media.remote.resumeControls(trigger);
  }
  #addSubmenu(menu) {
    this.#submenus.add(menu);
    new EventsController(menu).add("open", this.#onSubmenuOpenBind).add("close", this.#onSubmenuCloseBind);
    onDispose(this.#removeSubmenuBind);
  }
  #removeSubmenuBind = this.#removeSubmenu.bind(this);
  #removeSubmenu(menu) {
    this.#submenus.delete(menu);
  }
  #isSubmenuOpen = false;
  #onSubmenuOpenBind = this.#onSubmenuOpen.bind(this);
  #onSubmenuOpen(event) {
    this.#isSubmenuOpen = true;
    const content = this.#content();
    if (this.isSubmenu) {
      this.triggerElement?.setAttribute("aria-hidden", "true");
    }
    for (const target of this.#submenus) {
      if (target !== event.target) {
        for (const el of [target.el, target.triggerElement]) {
          el?.setAttribute("aria-hidden", "true");
        }
      }
    }
    if (content) {
      const el = event.target.el;
      for (const child of content.children) {
        if (child.contains(el)) {
          child.setAttribute("data-open", "");
        } else if (child !== el) {
          child.setAttribute("data-hidden", "");
        }
      }
    }
  }
  #onSubmenuCloseBind = this.#onSubmenuClose.bind(this);
  #onSubmenuClose(event) {
    this.#isSubmenuOpen = false;
    const content = this.#content();
    if (this.isSubmenu) {
      this.triggerElement?.setAttribute("aria-hidden", "false");
    }
    for (const target of this.#submenus) {
      for (const el of [target.el, target.triggerElement]) {
        el?.setAttribute("aria-hidden", "false");
      }
    }
    if (content) {
      for (const child of content.children) {
        child.removeAttribute("data-open");
        child.removeAttribute("data-hidden");
      }
    }
  }
  #onResize = animationFrameThrottle(() => {
    const content = peek(this.#content);
    if (!content || false) return;
    let height = 0, styles = getComputedStyle(content), children = [...content.children];
    for (const prop2 of ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"]) {
      height += parseFloat(styles[prop2]) || 0;
    }
    for (const child of children) {
      if (isHTMLElement(child) && child.style.display === "contents") {
        children.push(...child.children);
      } else if (child.nodeType === 3) {
        height += parseFloat(getComputedStyle(child).fontSize);
      } else if (isHTMLElement(child)) {
        if (!isElementVisible(child)) continue;
        const style = getComputedStyle(child);
        height += child.offsetHeight + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
      }
    }
    setStyle(content, "--menu-height", height + "px");
  });
  #isTransitionActive = false;
  #onResizeTransition(event) {
    const content = this.#content();
    if (content && event.propertyName === "height") {
      this.#isTransitionActive = event.type === "transitionstart";
      setAttribute(content, "data-transition", this.#isTransitionActive ? "height" : null);
      if (this.#expanded()) this.#updateFocus();
    }
    for (const callback of this.#transitionCallbacks) callback(event);
  }
  open(trigger) {
    if (peek(this.#expanded)) return;
    this.#popper.show(trigger);
    tick();
  }
  close(trigger) {
    if (!peek(this.#expanded)) return;
    this.#popper.hide(trigger);
    tick();
  }
};
__decorateClass([
  prop
], Menu$1.prototype, "triggerElement");
__decorateClass([
  prop
], Menu$1.prototype, "contentElement");
__decorateClass([
  prop
], Menu$1.prototype, "isSubmenu");
__decorateClass([
  method
], Menu$1.prototype, "open");
__decorateClass([
  method
], Menu$1.prototype, "close");

class MediaMenuElement extends Host(HTMLElement, Menu$1) {
  static tagName = "media-menu";
}

class MenuItem extends MenuButton$1 {
}

class MediaMenuItemElement extends Host(HTMLElement, MenuItem) {
  static tagName = "media-menu-item";
}

class MenuPortal extends Component {
  static props = {
    container: null,
    disabled: false
  };
  #target = null;
  #media;
  onSetup() {
    this.#media = useMediaContext();
    provideContext(menuPortalContext, {
      attach: this.#attachElement.bind(this)
    });
  }
  onAttach(el) {
    el.style.setProperty("display", "contents");
  }
  // Need this so connect scope is defined.
  onConnect(el) {
  }
  onDestroy() {
    this.#target?.remove();
    this.#target = null;
  }
  #attachElement(el) {
    this.#portal(false);
    this.#target = el;
    requestScopedAnimationFrame(() => {
      requestScopedAnimationFrame(() => {
        if (!this.connectScope) return;
        effect(this.#watchDisabled.bind(this));
      });
    });
  }
  #watchDisabled() {
    const { fullscreen } = this.#media.$state, { disabled } = this.$props;
    this.#portal(disabled() === "fullscreen" ? !fullscreen() : !disabled());
  }
  #portal(shouldPortal) {
    if (!this.#target) return;
    let container = this.#getContainer(this.$props.container());
    if (!container) return;
    const isPortalled = this.#target.parentElement === container;
    setAttribute(this.#target, "data-portal", shouldPortal);
    if (shouldPortal) {
      if (!isPortalled) {
        this.#target.remove();
        container.append(this.#target);
      }
    } else if (isPortalled && this.#target.parentElement === container) {
      this.#target.remove();
      this.el?.append(this.#target);
    }
  }
  #getContainer(selector) {
    if (isHTMLElement(selector)) return selector;
    return selector ? document.querySelector(selector) : document.body;
  }
}
const menuPortalContext = createContext();

class MenuItems extends Component {
  static props = {
    placement: null,
    offset: 0,
    alignOffset: 0
  };
  #menu;
  constructor() {
    super();
    new FocusVisibleController();
    const { placement } = this.$props;
    this.setAttributes({
      "data-placement": placement
    });
  }
  onAttach(el) {
    this.#menu = useContext(menuContext);
    this.#menu.attachMenuItems(this);
    if (hasProvidedContext(menuPortalContext)) {
      const portal = useContext(menuPortalContext);
      if (portal) {
        provideContext(menuPortalContext, null);
        portal.attach(el);
        onDispose(() => portal.attach(null));
      }
    }
  }
  onConnect(el) {
    effect(this.#watchPlacement.bind(this));
  }
  #watchPlacement() {
    const { expanded } = this.#menu;
    if (!this.el || !expanded()) return;
    const placement = this.$props.placement();
    if (!placement) return;
    Object.assign(this.el.style, {
      position: "absolute",
      top: 0,
      left: 0,
      width: "max-content"
    });
    const { offset: mainOffset, alignOffset } = this.$props;
    onDispose(
      autoPlacement(this.el, this.#getButton(), placement, {
        offsetVarName: "media-menu",
        xOffset: alignOffset(),
        yOffset: mainOffset()
      })
    );
    onDispose(this.#hide.bind(this));
  }
  #hide() {
    if (!this.el) return;
    this.el.removeAttribute("style");
    this.el.style.display = "none";
  }
  #getButton() {
    return this.#menu.button();
  }
}

class MediaMenuItemsElement extends Host(HTMLElement, MenuItems) {
  static tagName = "media-menu-items";
}

class MediaMenuPortalElement extends Host(HTMLElement, MenuPortal) {
  static tagName = "media-menu-portal";
  static attrs = {
    disabled: {
      converter(value) {
        if (isString(value)) return value;
        return value !== null;
      }
    }
  };
}

let QualityRadioGroup$1 = class QualityRadioGroup extends Component {
  static props = {
    autoLabel: "Auto",
    hideBitrate: false,
    sort: "descending"
  };
  #media;
  #menu;
  #controller;
  get value() {
    return this.#controller.value;
  }
  get disabled() {
    const { canSetQuality, qualities } = this.#media.$state;
    return !canSetQuality() || qualities().length <= 1;
  }
  #sortedQualities = computed(() => {
    const { sort } = this.$props, { qualities } = this.#media.$state;
    return sortVideoQualities(qualities(), sort() === "descending");
  });
  constructor() {
    super();
    this.#controller = new RadioGroupController();
    this.#controller.onValueChange = this.#onValueChange.bind(this);
  }
  onSetup() {
    this.#media = useMediaContext();
    if (hasProvidedContext(menuContext)) {
      this.#menu = useContext(menuContext);
    }
  }
  onConnect(el) {
    effect(this.#watchValue.bind(this));
    effect(this.#watchControllerDisabled.bind(this));
    effect(this.#watchHintText.bind(this));
  }
  getOptions() {
    const { autoLabel, hideBitrate } = this.$props;
    return [
      { value: "auto", label: autoLabel },
      ...this.#sortedQualities().map((quality) => {
        const bitrate = quality.bitrate && quality.bitrate >= 0 ? `${round(quality.bitrate / 1e6, 2)} Mbps` : null;
        return {
          quality,
          label: quality.height + "p",
          value: this.#getQualityId(quality),
          bitrate: () => !hideBitrate() ? bitrate : null
        };
      })
    ];
  }
  #watchValue() {
    this.#controller.value = this.#getValue();
  }
  #watchHintText() {
    const { autoLabel } = this.$props, { autoQuality, quality } = this.#media.$state, qualityText = quality() ? quality().height + "p" : "";
    this.#menu?.hint.set(
      !autoQuality() ? qualityText : autoLabel() + (qualityText ? ` (${qualityText})` : "")
    );
  }
  #watchControllerDisabled() {
    this.#menu?.disable(this.disabled);
  }
  #onValueChange(value, trigger) {
    if (this.disabled) return;
    if (value === "auto") {
      this.#media.remote.changeQuality(-1, trigger);
      this.dispatch("change", { detail: "auto", trigger });
      return;
    }
    const { qualities } = this.#media.$state, index = peek(qualities).findIndex((quality) => this.#getQualityId(quality) === value);
    if (index >= 0) {
      const quality = peek(qualities)[index];
      this.#media.remote.changeQuality(index, trigger);
      this.dispatch("change", { detail: quality, trigger });
    }
  }
  #getValue() {
    const { quality, autoQuality } = this.#media.$state;
    if (autoQuality()) return "auto";
    const currentQuality = quality();
    return currentQuality ? this.#getQualityId(currentQuality) : "auto";
  }
  #getQualityId(quality) {
    return quality.height + "_" + quality.bitrate;
  }
};
const qualityradiogroup__proto = QualityRadioGroup$1.prototype;
prop(qualityradiogroup__proto, "value");
prop(qualityradiogroup__proto, "disabled");
method(qualityradiogroup__proto, "getOptions");

class MediaQualityRadioGroupElement extends Host(HTMLElement, QualityRadioGroup$1) {
  static tagName = "media-quality-radio-group";
  onConnect() {
    renderMenuItemsTemplate(this, (el, option) => {
      const bitrate = option.bitrate, bitrateEl = el.querySelector('[data-part="bitrate"]');
      if (bitrate && bitrateEl) {
        effect(() => {
          bitrateEl.textContent = bitrate() || "";
        });
      }
    });
  }
}

class Radio extends Component {
  static props = {
    value: ""
  };
  #checked = signal(false);
  #controller = {
    value: this.$props.value,
    check: this.#check.bind(this),
    onCheck: null
  };
  /**
   * Whether this radio is currently checked.
   */
  get checked() {
    return this.#checked();
  }
  constructor() {
    super();
    new FocusVisibleController();
  }
  onSetup() {
    this.setAttributes({
      value: this.$props.value,
      "data-checked": this.#checked,
      "aria-checked": $ariaBool(this.#checked)
    });
  }
  onAttach(el) {
    const isMenuItem = hasProvidedContext(menuContext);
    setAttributeIfEmpty(el, "tabindex", isMenuItem ? "-1" : "0");
    setAttributeIfEmpty(el, "role", isMenuItem ? "menuitemradio" : "radio");
    effect(this.#watchValue.bind(this));
  }
  onConnect(el) {
    this.#addToGroup();
    onPress(el, this.#onPress.bind(this));
    onDispose(this.#onDisconnect.bind(this));
  }
  #onDisconnect() {
    scoped(() => {
      const group = useContext(radioControllerContext);
      group.remove(this.#controller);
    }, this.connectScope);
  }
  #addToGroup() {
    const group = useContext(radioControllerContext);
    group.add(this.#controller);
  }
  #watchValue() {
    const { value } = this.$props, newValue = value();
    if (peek(this.#checked)) {
      this.#controller.onCheck?.(newValue);
    }
  }
  #onPress(event) {
    if (peek(this.#checked)) return;
    this.#onChange(true, event);
    this.#onSelect(event);
    this.#controller.onCheck?.(peek(this.$props.value), event);
  }
  #check(value, trigger) {
    if (peek(this.#checked) === value) return;
    this.#onChange(value, trigger);
  }
  #onChange(value, trigger) {
    this.#checked.set(value);
    this.dispatch("change", { detail: value, trigger });
  }
  #onSelect(trigger) {
    this.dispatch("select", { trigger });
  }
}
const radio__proto = Radio.prototype;
prop(radio__proto, "checked");

class MediaRadioElement extends Host(HTMLElement, Radio) {
  static tagName = "media-radio";
}

class RadioGroup extends Component {
  static props = {
    value: ""
  };
  #controller;
  /**
   * A list of radio values that belong this group.
   */
  get values() {
    return this.#controller.values;
  }
  /**
   * The radio value that is checked in this group.
   */
  get value() {
    return this.#controller.value;
  }
  set value(newValue) {
    this.#controller.value = newValue;
  }
  constructor() {
    super();
    this.#controller = new RadioGroupController();
    this.#controller.onValueChange = this.#onValueChange.bind(this);
  }
  onSetup() {
    effect(this.#watchValue.bind(this));
  }
  #watchValue() {
    this.#controller.value = this.$props.value();
  }
  #onValueChange(value, trigger) {
    const event = this.createEvent("change", { detail: value, trigger });
    this.dispatch(event);
  }
}
const radiogroup__proto = RadioGroup.prototype;
prop(radiogroup__proto, "values");
prop(radiogroup__proto, "value");

class MediaRadioGroupElement extends Host(HTMLElement, RadioGroup) {
  static tagName = "media-radio-group";
}

const DEFAULT_PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
let SpeedRadioGroup$1 = class SpeedRadioGroup extends Component {
  static props = {
    normalLabel: "Normal",
    rates: DEFAULT_PLAYBACK_RATES
  };
  #media;
  #menu;
  #controller;
  get value() {
    return this.#controller.value;
  }
  get disabled() {
    const { rates } = this.$props, { canSetPlaybackRate } = this.#media.$state;
    return !canSetPlaybackRate() || rates().length === 0;
  }
  constructor() {
    super();
    this.#controller = new RadioGroupController();
    this.#controller.onValueChange = this.#onValueChange.bind(this);
  }
  onSetup() {
    this.#media = useMediaContext();
    if (hasProvidedContext(menuContext)) {
      this.#menu = useContext(menuContext);
    }
  }
  onConnect(el) {
    effect(this.#watchValue.bind(this));
    effect(this.#watchHintText.bind(this));
    effect(this.#watchControllerDisabled.bind(this));
  }
  getOptions() {
    const { rates, normalLabel } = this.$props;
    return rates().map((rate) => ({
      label: rate === 1 ? normalLabel : rate + "\xD7",
      value: rate.toString()
    }));
  }
  #watchValue() {
    this.#controller.value = this.#getValue();
  }
  #watchHintText() {
    const { normalLabel } = this.$props, { playbackRate } = this.#media.$state, rate = playbackRate();
    this.#menu?.hint.set(rate === 1 ? normalLabel() : rate + "\xD7");
  }
  #watchControllerDisabled() {
    this.#menu?.disable(this.disabled);
  }
  #getValue() {
    const { playbackRate } = this.#media.$state;
    return playbackRate().toString();
  }
  #onValueChange(value, trigger) {
    if (this.disabled) return;
    const rate = +value;
    this.#media.remote.changePlaybackRate(rate, trigger);
    this.dispatch("change", { detail: rate, trigger });
  }
};
const speedradiogroup__proto = SpeedRadioGroup$1.prototype;
prop(speedradiogroup__proto, "value");
prop(speedradiogroup__proto, "disabled");
method(speedradiogroup__proto, "getOptions");

class MediaSpeedRadioGroupElement extends Host(HTMLElement, SpeedRadioGroup$1) {
  static tagName = "media-speed-radio-group";
  onConnect() {
    renderMenuItemsTemplate(this);
  }
}

let Poster$1 = class Poster extends Component {
  static props = {
    src: null,
    alt: null,
    crossOrigin: null
  };
  static state = new State({
    img: null,
    src: null,
    alt: null,
    crossOrigin: null,
    loading: true,
    error: null,
    hidden: false
  });
  #media;
  onSetup() {
    this.#media = useMediaContext();
    this.#watchSrc();
    this.#watchAlt();
    this.#watchCrossOrigin();
    this.#watchHidden();
  }
  onAttach(el) {
    el.style.setProperty("pointer-events", "none");
    effect(this.#watchImg.bind(this));
    effect(this.#watchSrc.bind(this));
    effect(this.#watchAlt.bind(this));
    effect(this.#watchCrossOrigin.bind(this));
    effect(this.#watchHidden.bind(this));
    const { started } = this.#media.$state;
    this.setAttributes({
      "data-visible": () => !started() && !this.$state.hidden(),
      "data-loading": this.#isLoading.bind(this),
      "data-error": this.#hasError.bind(this),
      "data-hidden": this.$state.hidden
    });
  }
  onConnect(el) {
    effect(this.#onPreconnect.bind(this));
    effect(this.#onLoadStart.bind(this));
  }
  #hasError() {
    const { error } = this.$state;
    return !isNull(error());
  }
  #onPreconnect() {
    const { canLoadPoster, poster } = this.#media.$state;
    if (!canLoadPoster() && poster()) preconnect(poster(), "preconnect");
  }
  #watchHidden() {
    const { src } = this.$props, { poster, nativeControls } = this.#media.$state;
    this.el && setAttribute(this.el, "display", nativeControls() ? "none" : null);
    this.$state.hidden.set(this.#hasError() || !(src() || poster()) || nativeControls());
  }
  #isLoading() {
    const { loading, hidden } = this.$state;
    return !hidden() && loading();
  }
  #watchImg() {
    const img = this.$state.img();
    if (!img) return;
    new EventsController(img).add("load", this.#onLoad.bind(this)).add("error", this.#onError.bind(this));
    if (img.complete) this.#onLoad();
  }
  #prevSrc = "";
  #watchSrc() {
    const { poster: defaultPoster } = this.#media.$props, { canLoadPoster, providedPoster, inferredPoster } = this.#media.$state;
    const src = this.$props.src() || "", poster = src || defaultPoster() || inferredPoster();
    if (this.#prevSrc === providedPoster()) {
      providedPoster.set(src);
    }
    this.$state.src.set(canLoadPoster() && poster.length ? poster : null);
    this.#prevSrc = src;
  }
  #watchAlt() {
    const { src } = this.$props, { alt } = this.$state, { poster } = this.#media.$state;
    alt.set(src() || poster() ? this.$props.alt() : null);
  }
  #watchCrossOrigin() {
    const { crossOrigin: crossOriginProp } = this.$props, { crossOrigin: crossOriginState } = this.$state, { crossOrigin: mediaCrossOrigin, poster: src } = this.#media.$state, crossOrigin = crossOriginProp() !== null ? crossOriginProp() : mediaCrossOrigin();
    crossOriginState.set(
      /ytimg\.com|vimeo/.test(src() || "") ? null : crossOrigin === true ? "anonymous" : crossOrigin
    );
  }
  #onLoadStart() {
    const { loading, error } = this.$state, { canLoadPoster, poster } = this.#media.$state;
    loading.set(canLoadPoster() && !!poster());
    error.set(null);
  }
  #onLoad() {
    const { loading, error } = this.$state;
    loading.set(false);
    error.set(null);
  }
  #onError(event) {
    const { loading, error } = this.$state;
    loading.set(false);
    error.set(event);
  }
};

class MediaPosterElement extends Host(HTMLElement, Poster$1) {
  static tagName = "media-poster";
  static attrs = {
    crossOrigin: "crossorigin"
  };
  #img = document.createElement("img");
  onSetup() {
    this.$state.img.set(this.#img);
  }
  onConnect() {
    const { src, alt, crossOrigin } = this.$state;
    effect(() => {
      const { loading, hidden } = this.$state;
      this.#img.style.display = loading() || hidden() ? "none" : "";
    });
    effect(() => {
      setAttribute(this.#img, "alt", alt());
      setAttribute(this.#img, "crossorigin", crossOrigin());
      setAttribute(this.#img, "src", src());
    });
    if (this.#img.parentNode !== this) {
      this.prepend(this.#img);
    }
  }
}

var posterElement = /*#__PURE__*/Object.freeze({
  __proto__: null,
  MediaPosterElement: MediaPosterElement
});

const sliderState = new State({
  min: 0,
  max: 100,
  value: 0,
  step: 1,
  pointerValue: 0,
  focused: false,
  dragging: false,
  pointing: false,
  hidden: false,
  get active() {
    return this.dragging || this.focused || this.pointing;
  },
  get fillRate() {
    return calcRate(this.min, this.max, this.value);
  },
  get fillPercent() {
    return this.fillRate * 100;
  },
  get pointerRate() {
    return calcRate(this.min, this.max, this.pointerValue);
  },
  get pointerPercent() {
    return this.pointerRate * 100;
  }
});
function calcRate(min, max, value) {
  const range = max - min, offset = value - min;
  return range > 0 ? offset / range : 0;
}

const sliderValueFormatContext = createContext(() => ({}));

class IntersectionObserverController extends ViewController {
  #init;
  #observer;
  constructor(init) {
    super();
    this.#init = init;
  }
  onConnect(el) {
    this.#observer = new IntersectionObserver((entries) => {
      this.#init.callback?.(entries, this.#observer);
    }, this.#init);
    this.#observer.observe(el);
    onDispose(this.#onDisconnect.bind(this));
  }
  /**
   * Disconnect any active intersection observers.
   */
  #onDisconnect() {
    this.#observer?.disconnect();
    this.#observer = void 0;
  }
}

function getClampedValue(min, max, value, step) {
  return clampNumber(min, round(value, getNumberOfDecimalPlaces(step)), max);
}
function getValueFromRate(min, max, rate, step) {
  const boundRate = clampNumber(0, rate, 1), range = max - min, fill = range * boundRate, stepRatio = fill / step, steps = step * Math.round(stepRatio);
  return min + steps;
}

const SliderKeyDirection = {
  Left: -1,
  ArrowLeft: -1,
  Up: 1,
  ArrowUp: 1,
  Right: 1,
  ArrowRight: 1,
  Down: -1,
  ArrowDown: -1
};
class SliderEventsController extends ViewController {
  #delegate;
  #media;
  #observer;
  constructor(delegate, media) {
    super();
    this.#delegate = delegate;
    this.#media = media;
  }
  onSetup() {
    if (hasProvidedContext(sliderObserverContext)) {
      this.#observer = useContext(sliderObserverContext);
    }
  }
  onConnect(el) {
    effect(this.#attachEventListeners.bind(this, el));
    effect(this.#attachPointerListeners.bind(this, el));
    if (this.#delegate.swipeGesture) effect(this.#watchSwipeGesture.bind(this));
  }
  #watchSwipeGesture() {
    const { pointer } = this.#media.$state;
    if (pointer() !== "coarse" || !this.#delegate.swipeGesture()) {
      this.#provider = null;
      return;
    }
    this.#provider = this.#media.player.el?.querySelector(
      "media-provider,[data-media-provider]"
    );
    if (!this.#provider) return;
    new EventsController(this.#provider).add("touchstart", this.#onTouchStart.bind(this), {
      passive: true
    }).add("touchmove", this.#onTouchMove.bind(this), { passive: false });
  }
  #provider = null;
  #touch = null;
  #touchStartValue = null;
  #onTouchStart(event) {
    this.#touch = event.touches[0];
  }
  #onTouchMove(event) {
    if (isNull(this.#touch) || isTouchPinchEvent(event)) return;
    const touch = event.touches[0], xDiff = touch.clientX - this.#touch.clientX, yDiff = touch.clientY - this.#touch.clientY, isDragging = this.$state.dragging();
    if (!isDragging && Math.abs(yDiff) > 5) {
      return;
    }
    if (isDragging) return;
    event.preventDefault();
    if (Math.abs(xDiff) > 20) {
      this.#touch = touch;
      this.#touchStartValue = this.$state.value();
      this.#onStartDragging(this.#touchStartValue, event);
    }
  }
  #attachEventListeners(el) {
    const { hidden } = this.$props;
    listenEvent(el, "focus", this.#onFocus.bind(this));
    if (hidden() || this.#delegate.isDisabled()) return;
    new EventsController(el).add("keyup", this.#onKeyUp.bind(this)).add("keydown", this.#onKeyDown.bind(this)).add("pointerenter", this.#onPointerEnter.bind(this)).add("pointermove", this.#onPointerMove.bind(this)).add("pointerleave", this.#onPointerLeave.bind(this)).add("pointerdown", this.#onPointerDown.bind(this));
  }
  #attachPointerListeners(el) {
    if (this.#delegate.isDisabled() || !this.$state.dragging()) return;
    new EventsController(document).add("pointerup", this.#onDocumentPointerUp.bind(this), { capture: true }).add("pointermove", this.#onDocumentPointerMove.bind(this)).add("touchmove", this.#onDocumentTouchMove.bind(this), {
      passive: false
    });
  }
  #onFocus() {
    this.#updatePointerValue(this.$state.value());
  }
  #updateValue(newValue, trigger) {
    const { value, min, max, dragging } = this.$state;
    const clampedValue = Math.max(min(), Math.min(newValue, max()));
    value.set(clampedValue);
    const event = this.createEvent("value-change", { detail: clampedValue, trigger });
    this.dispatch(event);
    this.#delegate.onValueChange?.(event);
    if (dragging()) {
      const event2 = this.createEvent("drag-value-change", { detail: clampedValue, trigger });
      this.dispatch(event2);
      this.#delegate.onDragValueChange?.(event2);
    }
  }
  #updatePointerValue(value, trigger) {
    const { pointerValue, dragging } = this.$state;
    pointerValue.set(value);
    this.dispatch("pointer-value-change", { detail: value, trigger });
    if (dragging()) {
      this.#updateValue(value, trigger);
    }
  }
  #getPointerValue(event) {
    let thumbPositionRate, rect = this.el.getBoundingClientRect(), { min, max } = this.$state;
    if (this.$props.orientation() === "vertical") {
      const { bottom: trackBottom, height: trackHeight } = rect;
      thumbPositionRate = (trackBottom - event.clientY) / trackHeight;
    } else {
      if (this.#touch && isNumber(this.#touchStartValue)) {
        const { width } = this.#provider.getBoundingClientRect(), rate = (event.clientX - this.#touch.clientX) / width, range = max() - min(), diff = range * Math.abs(rate);
        thumbPositionRate = (rate < 0 ? this.#touchStartValue - diff : this.#touchStartValue + diff) / range;
      } else {
        const { left: trackLeft, width: trackWidth } = rect;
        thumbPositionRate = (event.clientX - trackLeft) / trackWidth;
      }
    }
    return Math.max(
      min(),
      Math.min(
        max(),
        this.#delegate.roundValue(
          getValueFromRate(min(), max(), thumbPositionRate, this.#delegate.getStep())
        )
      )
    );
  }
  #onPointerEnter(event) {
    this.$state.pointing.set(true);
  }
  #onPointerMove(event) {
    const { dragging } = this.$state;
    if (dragging()) return;
    this.#updatePointerValue(this.#getPointerValue(event), event);
  }
  #onPointerLeave(event) {
    this.$state.pointing.set(false);
  }
  #onPointerDown(event) {
    if (event.button !== 0) return;
    const value = this.#getPointerValue(event);
    this.#onStartDragging(value, event);
    this.#updatePointerValue(value, event);
  }
  #onStartDragging(value, trigger) {
    const { dragging } = this.$state;
    if (dragging()) return;
    dragging.set(true);
    this.#media.remote.pauseControls(trigger);
    const event = this.createEvent("drag-start", { detail: value, trigger });
    this.dispatch(event);
    this.#delegate.onDragStart?.(event);
    this.#observer?.onDragStart?.();
  }
  #onStopDragging(value, trigger) {
    const { dragging } = this.$state;
    if (!dragging()) return;
    dragging.set(false);
    this.#media.remote.resumeControls(trigger);
    const event = this.createEvent("drag-end", { detail: value, trigger });
    this.dispatch(event);
    this.#delegate.onDragEnd?.(event);
    this.#touch = null;
    this.#touchStartValue = null;
    this.#observer?.onDragEnd?.();
  }
  // -------------------------------------------------------------------------------------------
  // Keyboard Events
  // -------------------------------------------------------------------------------------------
  #lastDownKey;
  #repeatedKeys = false;
  #onKeyDown(event) {
    const isValidKey = Object.keys(SliderKeyDirection).includes(event.key);
    if (!isValidKey) return;
    const { key } = event, jumpValue = this.#calcJumpValue(event);
    if (!isNull(jumpValue)) {
      this.#updatePointerValue(jumpValue, event);
      this.#updateValue(jumpValue, event);
      return;
    }
    const newValue = this.#calcNewKeyValue(event);
    if (!this.#repeatedKeys) {
      this.#repeatedKeys = key === this.#lastDownKey;
      if (!this.$state.dragging() && this.#repeatedKeys) {
        this.#onStartDragging(newValue, event);
      }
    }
    this.#updatePointerValue(newValue, event);
    this.#lastDownKey = key;
  }
  #onKeyUp(event) {
    const isValidKey = Object.keys(SliderKeyDirection).includes(event.key);
    if (!isValidKey || !isNull(this.#calcJumpValue(event))) return;
    const newValue = this.#repeatedKeys ? this.$state.pointerValue() : this.#calcNewKeyValue(event);
    this.#updateValue(newValue, event);
    this.#onStopDragging(newValue, event);
    this.#lastDownKey = "";
    this.#repeatedKeys = false;
  }
  #calcJumpValue(event) {
    let key = event.key, { min, max } = this.$state;
    if (key === "Home" || key === "PageUp") {
      return min();
    } else if (key === "End" || key === "PageDown") {
      return max();
    } else if (!event.metaKey && /^[0-9]$/.test(key)) {
      return (max() - min()) / 10 * Number(key);
    }
    return null;
  }
  #calcNewKeyValue(event) {
    const { key, shiftKey } = event;
    event.preventDefault();
    event.stopPropagation();
    const { shiftKeyMultiplier } = this.$props;
    const { min, max, value, pointerValue } = this.$state, step = this.#delegate.getStep(), keyStep = this.#delegate.getKeyStep();
    const modifiedStep = !shiftKey ? keyStep : keyStep * shiftKeyMultiplier(), direction = Number(SliderKeyDirection[key]), diff = modifiedStep * direction, currentValue = this.#repeatedKeys ? pointerValue() : this.#delegate.getValue?.() ?? value(), steps = (currentValue + diff) / step;
    return Math.max(min(), Math.min(max(), Number((step * steps).toFixed(3))));
  }
  // -------------------------------------------------------------------------------------------
  // Document (Pointer Events)
  // -------------------------------------------------------------------------------------------
  #onDocumentPointerUp(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const value = this.#getPointerValue(event);
    this.#updatePointerValue(value, event);
    this.#onStopDragging(value, event);
  }
  #onDocumentTouchMove(event) {
    event.preventDefault();
  }
  #onDocumentPointerMove = functionThrottle(
    (event) => {
      this.#updatePointerValue(this.#getPointerValue(event), event);
    },
    20,
    { leading: true }
  );
}

class SliderController extends ViewController {
  static props = {
    hidden: false,
    disabled: false,
    step: 1,
    keyStep: 1,
    orientation: "horizontal",
    shiftKeyMultiplier: 5
  };
  #media;
  #delegate;
  #isVisible = signal(true);
  #isIntersecting = signal(true);
  constructor(delegate) {
    super();
    this.#delegate = delegate;
  }
  onSetup() {
    this.#media = useMediaContext();
    const focus = new FocusVisibleController();
    focus.attach(this);
    this.$state.focused = focus.focused.bind(focus);
    if (!hasProvidedContext(sliderValueFormatContext)) {
      provideContext(sliderValueFormatContext, {
        default: "value"
      });
    }
    provideContext(sliderContext, {
      orientation: this.$props.orientation,
      disabled: this.#delegate.isDisabled,
      preview: signal(null)
    });
    effect(this.#watchValue.bind(this));
    effect(this.#watchStep.bind(this));
    effect(this.#watchDisabled.bind(this));
    this.#setupAttrs();
    new SliderEventsController(this.#delegate, this.#media).attach(this);
    new IntersectionObserverController({
      callback: this.#onIntersectionChange.bind(this)
    }).attach(this);
  }
  onAttach(el) {
    setAttributeIfEmpty(el, "role", "slider");
    setAttributeIfEmpty(el, "tabindex", "0");
    setAttributeIfEmpty(el, "autocomplete", "off");
    effect(this.#watchCSSVars.bind(this));
  }
  onConnect(el) {
    onDispose(observeVisibility(el, this.#isVisible.set));
    effect(this.#watchHidden.bind(this));
  }
  #onIntersectionChange(entries) {
    this.#isIntersecting.set(entries[0].isIntersecting);
  }
  // -------------------------------------------------------------------------------------------
  // Watch
  // -------------------------------------------------------------------------------------------
  #watchHidden() {
    const { hidden } = this.$props;
    this.$state.hidden.set(hidden() || !this.#isVisible() || !this.#isIntersecting.bind(this));
  }
  #watchValue() {
    const { dragging, value, min, max } = this.$state;
    if (peek(dragging)) return;
    value.set(getClampedValue(min(), max(), value(), this.#delegate.getStep()));
  }
  #watchStep() {
    this.$state.step.set(this.#delegate.getStep());
  }
  #watchDisabled() {
    if (!this.#delegate.isDisabled()) return;
    const { dragging, pointing } = this.$state;
    dragging.set(false);
    pointing.set(false);
  }
  // -------------------------------------------------------------------------------------------
  // ARIA
  // -------------------------------------------------------------------------------------------
  #getARIADisabled() {
    return ariaBool$1(this.#delegate.isDisabled());
  }
  // -------------------------------------------------------------------------------------------
  // Attributes
  // -------------------------------------------------------------------------------------------
  #setupAttrs() {
    const { orientation } = this.$props, { dragging, active, pointing } = this.$state;
    this.setAttributes({
      "data-dragging": dragging,
      "data-pointing": pointing,
      "data-active": active,
      "aria-disabled": this.#getARIADisabled.bind(this),
      "aria-valuemin": this.#delegate.aria.valueMin ?? this.$state.min,
      "aria-valuemax": this.#delegate.aria.valueMax ?? this.$state.max,
      "aria-valuenow": this.#delegate.aria.valueNow,
      "aria-valuetext": this.#delegate.aria.valueText,
      "aria-orientation": orientation
    });
  }
  #watchCSSVars() {
    const { fillPercent, pointerPercent } = this.$state;
    this.#updateSliderVars(round(fillPercent(), 3), round(pointerPercent(), 3));
  }
  #updateSliderVars = animationFrameThrottle((fillPercent, pointerPercent) => {
    this.el?.style.setProperty("--slider-fill", fillPercent + "%");
    this.el?.style.setProperty("--slider-pointer", pointerPercent + "%");
  });
}

class AudioGainSlider extends Component {
  static props = {
    ...SliderController.props,
    step: 25,
    keyStep: 25,
    shiftKeyMultiplier: 2,
    min: 0,
    max: 300
  };
  static state = sliderState;
  #media;
  onSetup() {
    this.#media = useMediaContext();
    provideContext(sliderValueFormatContext, {
      default: "percent",
      percent: (_, decimalPlaces) => {
        return round(this.$state.value(), decimalPlaces) + "%";
      }
    });
    new SliderController({
      getStep: this.$props.step,
      getKeyStep: this.$props.keyStep,
      roundValue: Math.round,
      isDisabled: this.#isDisabled.bind(this),
      aria: {
        valueNow: this.#getARIAValueNow.bind(this),
        valueText: this.#getARIAValueText.bind(this)
      },
      onDragValueChange: this.#onDragValueChange.bind(this),
      onValueChange: this.#onValueChange.bind(this)
    }).attach(this);
    effect(this.#watchMinMax.bind(this));
    effect(this.#watchAudioGain.bind(this));
  }
  onAttach(el) {
    el.setAttribute("data-media-audio-gain-slider", "");
    setAttributeIfEmpty(el, "aria-label", "Audio Boost");
    const { canSetAudioGain } = this.#media.$state;
    this.setAttributes({
      "data-supported": canSetAudioGain,
      "aria-hidden": $ariaBool(() => !canSetAudioGain())
    });
  }
  #getARIAValueNow() {
    const { value } = this.$state;
    return Math.round(value());
  }
  #getARIAValueText() {
    const { value } = this.$state;
    return value() + "%";
  }
  #watchMinMax() {
    const { min, max } = this.$props;
    this.$state.min.set(min());
    this.$state.max.set(max());
  }
  #watchAudioGain() {
    const { audioGain } = this.#media.$state, value = ((audioGain() ?? 1) - 1) * 100;
    this.$state.value.set(value);
    this.dispatch("value-change", { detail: value });
  }
  #isDisabled() {
    const { disabled } = this.$props, { canSetAudioGain } = this.#media.$state;
    return disabled() || !canSetAudioGain();
  }
  #onAudioGainChange(event) {
    if (!event.trigger) return;
    const gain = round(1 + event.detail / 100, 2);
    this.#media.remote.changeAudioGain(gain, event);
  }
  #onValueChange(event) {
    this.#onAudioGainChange(event);
  }
  #onDragValueChange(event) {
    this.#onAudioGainChange(event);
  }
}

class MediaAudioGainSliderElement extends Host(HTMLElement, AudioGainSlider) {
  static tagName = "media-audio-gain-slider";
}

class QualitySlider extends Component {
  static props = {
    ...SliderController.props,
    step: 1,
    keyStep: 1,
    shiftKeyMultiplier: 1
  };
  static state = sliderState;
  #media;
  #sortedQualities = computed(() => {
    const { qualities } = this.#media.$state;
    return sortVideoQualities(qualities());
  });
  onSetup() {
    this.#media = useMediaContext();
    new SliderController({
      getStep: this.$props.step,
      getKeyStep: this.$props.keyStep,
      roundValue: Math.round,
      isDisabled: this.#isDisabled.bind(this),
      aria: {
        valueNow: this.#getARIAValueNow.bind(this),
        valueText: this.#getARIAValueText.bind(this)
      },
      onDragValueChange: this.#onDragValueChange.bind(this),
      onValueChange: this.#onValueChange.bind(this)
    }).attach(this);
    effect(this.#watchMax.bind(this));
    effect(this.#watchQuality.bind(this));
  }
  onAttach(el) {
    el.setAttribute("data-media-quality-slider", "");
    setAttributeIfEmpty(el, "aria-label", "Video Quality");
    const { qualities, canSetQuality } = this.#media.$state, $supported = computed(() => canSetQuality() && qualities().length > 0);
    this.setAttributes({
      "data-supported": $supported,
      "aria-hidden": $ariaBool(() => !$supported())
    });
  }
  #getARIAValueNow() {
    const { value } = this.$state;
    return value();
  }
  #getARIAValueText() {
    const { quality } = this.#media.$state;
    if (!quality()) return "";
    const { height, bitrate } = quality(), bitrateText = bitrate && bitrate > 0 ? `${(bitrate / 1e6).toFixed(2)} Mbps` : null;
    return height ? `${height}p${bitrateText ? ` (${bitrateText})` : ""}` : "Auto";
  }
  #watchMax() {
    const $qualities = this.#sortedQualities();
    this.$state.max.set(Math.max(0, $qualities.length - 1));
  }
  #watchQuality() {
    let { quality } = this.#media.$state, $qualities = this.#sortedQualities(), value = Math.max(0, $qualities.indexOf(quality()));
    this.$state.value.set(value);
    this.dispatch("value-change", { detail: value });
  }
  #isDisabled() {
    const { disabled } = this.$props, { canSetQuality, qualities } = this.#media.$state;
    return disabled() || qualities().length <= 1 || !canSetQuality();
  }
  #throttledQualityChange = functionThrottle(this.#onQualityChange.bind(this), 25);
  #onQualityChange(event) {
    if (!event.trigger) return;
    const { qualities } = this.#media, quality = peek(this.#sortedQualities)[event.detail];
    this.#media.remote.changeQuality(qualities.indexOf(quality), event);
  }
  #onValueChange(event) {
    this.#throttledQualityChange(event);
  }
  #onDragValueChange(event) {
    this.#throttledQualityChange(event);
  }
}

class MediaQualitySliderElement extends Host(HTMLElement, QualitySlider) {
  static tagName = "media-quality-slider";
}

let TimeSlider$1 = class TimeSlider extends Component {
  static props = {
    ...SliderController.props,
    step: 0.1,
    keyStep: 5,
    shiftKeyMultiplier: 2,
    pauseWhileDragging: false,
    noSwipeGesture: false,
    seekingRequestThrottle: 100
  };
  static state = sliderState;
  #media;
  #dispatchSeeking;
  #chapter = signal(null);
  constructor() {
    super();
    const { noSwipeGesture } = this.$props;
    new SliderController({
      swipeGesture: () => !noSwipeGesture(),
      getValue: this.#getValue.bind(this),
      getStep: this.#getStep.bind(this),
      getKeyStep: this.#getKeyStep.bind(this),
      roundValue: this.#roundValue,
      isDisabled: this.#isDisabled.bind(this),
      aria: {
        valueNow: this.#getARIAValueNow.bind(this),
        valueText: this.#getARIAValueText.bind(this)
      },
      onDragStart: this.#onDragStart.bind(this),
      onDragValueChange: this.#onDragValueChange.bind(this),
      onDragEnd: this.#onDragEnd.bind(this),
      onValueChange: this.#onValueChange.bind(this)
    });
  }
  onSetup() {
    this.#media = useMediaContext();
    provideContext(sliderValueFormatContext, {
      default: "time",
      value: this.#formatValue.bind(this),
      time: this.#formatTime.bind(this)
    });
    this.setAttributes({
      "data-chapters": this.#hasChapters.bind(this)
    });
    this.setStyles({
      "--slider-progress": this.#calcBufferedPercent.bind(this)
    });
    effect(this.#watchCurrentTime.bind(this));
    effect(this.#watchSeekingThrottle.bind(this));
  }
  onAttach(el) {
    el.setAttribute("data-media-time-slider", "");
    setAttributeIfEmpty(el, "aria-label", "Seek");
  }
  onConnect(el) {
    effect(this.#watchPreviewing.bind(this));
    watchActiveTextTrack(this.#media.textTracks, "chapters", this.#chapter.set);
  }
  #calcBufferedPercent() {
    const { bufferedEnd, duration } = this.#media.$state;
    return round(Math.min(bufferedEnd() / Math.max(duration(), 1), 1) * 100, 3) + "%";
  }
  #hasChapters() {
    const { duration } = this.#media.$state;
    return this.#chapter()?.cues.length && Number.isFinite(duration()) && duration() > 0;
  }
  #watchSeekingThrottle() {
    this.#dispatchSeeking = functionThrottle(
      this.#seeking.bind(this),
      this.$props.seekingRequestThrottle()
    );
  }
  #watchCurrentTime() {
    if (this.$state.hidden()) return;
    const { value, dragging } = this.$state, newValue = this.#getValue();
    if (!peek(dragging)) {
      value.set(newValue);
      this.dispatch("value-change", { detail: newValue });
    }
  }
  #watchPreviewing() {
    const player = this.#media.player.el, { preview } = useContext(sliderContext);
    player && preview() && setAttribute(player, "data-preview", this.$state.active());
  }
  #seeking(time, event) {
    this.#media.remote.seeking(time, event);
  }
  #seek(time, percent, event) {
    this.#dispatchSeeking.cancel();
    const { live } = this.#media.$state;
    if (live() && percent >= 99) {
      this.#media.remote.seekToLiveEdge(event);
      return;
    }
    this.#media.remote.seek(time, event);
  }
  #playingBeforeDragStart = false;
  #onDragStart(event) {
    const { pauseWhileDragging } = this.$props;
    if (pauseWhileDragging()) {
      const { paused } = this.#media.$state;
      this.#playingBeforeDragStart = !paused();
      this.#media.remote.pause(event);
    }
  }
  #onDragValueChange(event) {
    this.#dispatchSeeking(this.#percentToTime(event.detail), event);
  }
  #onDragEnd(event) {
    const { seeking } = this.#media.$state;
    if (!peek(seeking)) this.#seeking(this.#percentToTime(event.detail), event);
    const percent = event.detail;
    this.#seek(this.#percentToTime(percent), percent, event);
    const { pauseWhileDragging } = this.$props;
    if (pauseWhileDragging() && this.#playingBeforeDragStart) {
      this.#media.remote.play(event);
      this.#playingBeforeDragStart = false;
    }
  }
  #onValueChange(event) {
    const { dragging } = this.$state;
    if (dragging() || !event.trigger) return;
    this.#onDragEnd(event);
  }
  // -------------------------------------------------------------------------------------------
  // Props
  // -------------------------------------------------------------------------------------------
  #getValue() {
    const { currentTime } = this.#media.$state;
    return this.#timeToPercent(currentTime());
  }
  #getStep() {
    const value = this.$props.step() / this.#media.$state.duration() * 100;
    return Number.isFinite(value) ? value : 1;
  }
  #getKeyStep() {
    const value = this.$props.keyStep() / this.#media.$state.duration() * 100;
    return Number.isFinite(value) ? value : 1;
  }
  #roundValue(value) {
    return round(value, 3);
  }
  #isDisabled() {
    const { disabled } = this.$props, { canSeek } = this.#media.$state;
    return disabled() || !canSeek();
  }
  // -------------------------------------------------------------------------------------------
  // ARIA
  // -------------------------------------------------------------------------------------------
  #getARIAValueNow() {
    const { value } = this.$state;
    return Math.round(value());
  }
  #getARIAValueText() {
    const time = this.#percentToTime(this.$state.value()), { duration } = this.#media.$state;
    return Number.isFinite(time) ? `${formatSpokenTime(time)} out of ${formatSpokenTime(duration())}` : "live";
  }
  // -------------------------------------------------------------------------------------------
  // Format
  // -------------------------------------------------------------------------------------------
  #percentToTime(percent) {
    const { duration } = this.#media.$state;
    return round(percent / 100 * duration(), 5);
  }
  #timeToPercent(time) {
    const { liveEdge, duration } = this.#media.$state, rate = Math.max(0, Math.min(1, liveEdge() ? 1 : Math.min(time, duration()) / duration()));
    return Number.isNaN(rate) ? 0 : Number.isFinite(rate) ? rate * 100 : 100;
  }
  #formatValue(percent) {
    const time = this.#percentToTime(percent), { live, duration } = this.#media.$state;
    return Number.isFinite(time) ? (live() ? time - duration() : time).toFixed(0) : "LIVE";
  }
  #formatTime(percent, options) {
    const time = this.#percentToTime(percent), { live, duration } = this.#media.$state, value = live() ? time - duration() : time;
    return Number.isFinite(time) ? `${value < 0 ? "-" : ""}${formatTime(Math.abs(value), options)}` : "LIVE";
  }
};

class SliderChapters extends Component {
  static props = {
    disabled: false
  };
  #media;
  #sliderState;
  #updateScope;
  #titleRef = null;
  #refs = [];
  #$track = signal(null);
  #$cues = signal([]);
  #activeIndex = signal(-1);
  #activePointerIndex = signal(-1);
  #bufferedIndex = 0;
  get cues() {
    return this.#$cues();
  }
  get activeCue() {
    return this.#$cues()[this.#activeIndex()] || null;
  }
  get activePointerCue() {
    return this.#$cues()[this.#activePointerIndex()] || null;
  }
  onSetup() {
    this.#media = useMediaContext();
    this.#sliderState = useState(TimeSlider$1.state);
  }
  onAttach(el) {
    watchActiveTextTrack(this.#media.textTracks, "chapters", this.#setTrack.bind(this));
    effect(this.#watchSource.bind(this));
  }
  onConnect() {
    onDispose(() => this.#reset.bind(this));
  }
  onDestroy() {
    this.#setTrack(null);
  }
  setRefs(refs) {
    this.#refs = refs;
    this.#updateScope?.dispose();
    if (this.#refs.length === 1) {
      const el = this.#refs[0];
      el.style.width = "100%";
      el.style.setProperty("--chapter-fill", "var(--slider-fill)");
      el.style.setProperty("--chapter-progress", "var(--slider-progress)");
    } else if (this.#refs.length > 0) {
      scoped(() => this.#watch(), this.#updateScope = createScope());
    }
  }
  #setTrack(track) {
    if (peek(this.#$track) === track) return;
    this.#reset();
    this.#$track.set(track);
  }
  #reset() {
    this.#refs = [];
    this.#$cues.set([]);
    this.#activeIndex.set(-1);
    this.#activePointerIndex.set(-1);
    this.#bufferedIndex = 0;
    this.#updateScope?.dispose();
  }
  #watch() {
    if (!this.#refs.length) return;
    effect(this.#watchUpdates.bind(this));
  }
  #watchUpdates() {
    const { hidden } = this.#sliderState;
    if (hidden()) return;
    effect(this.#watchContainerWidths.bind(this));
    effect(this.#watchFillPercent.bind(this));
    effect(this.#watchPointerPercent.bind(this));
    effect(this.#watchBufferedPercent.bind(this));
  }
  #watchContainerWidths() {
    const cues = this.#$cues();
    if (!cues.length) return;
    let cue, { seekableStart, seekableEnd } = this.#media.$state, startTime = seekableStart(), endTime = seekableEnd() || cues[cues.length - 1].endTime, duration = endTime - startTime, remainingWidth = 100;
    for (let i = 0; i < cues.length; i++) {
      cue = cues[i];
      if (this.#refs[i]) {
        const width = i === cues.length - 1 ? remainingWidth : round((cue.endTime - Math.max(startTime, cue.startTime)) / duration * 100, 3);
        this.#refs[i].style.width = width + "%";
        remainingWidth -= width;
      }
    }
  }
  #watchFillPercent() {
    let { liveEdge, seekableStart, seekableEnd } = this.#media.$state, { fillPercent, value } = this.#sliderState, cues = this.#$cues(), isLiveEdge = liveEdge(), prevActiveIndex = peek(this.#activeIndex), currentChapter = cues[prevActiveIndex];
    let currentActiveIndex = isLiveEdge ? this.#$cues.length - 1 : this.#findActiveChapterIndex(
      currentChapter ? currentChapter.startTime / seekableEnd() * 100 <= peek(value) ? prevActiveIndex : 0 : 0,
      fillPercent()
    );
    if (isLiveEdge || !currentChapter) {
      this.#updateFillPercents(0, cues.length, 100);
    } else if (currentActiveIndex > prevActiveIndex) {
      this.#updateFillPercents(prevActiveIndex, currentActiveIndex, 100);
    } else if (currentActiveIndex < prevActiveIndex) {
      this.#updateFillPercents(currentActiveIndex + 1, prevActiveIndex + 1, 0);
    }
    const percent = isLiveEdge ? 100 : this.#calcPercent(
      cues[currentActiveIndex],
      fillPercent(),
      seekableStart(),
      this.#getEndTime(cues)
    );
    this.#updateFillPercent(this.#refs[currentActiveIndex], percent);
    this.#activeIndex.set(currentActiveIndex);
  }
  #watchPointerPercent() {
    let { pointing, pointerPercent } = this.#sliderState;
    if (!pointing()) {
      this.#activePointerIndex.set(-1);
      return;
    }
    const activeIndex = this.#findActiveChapterIndex(0, pointerPercent());
    this.#activePointerIndex.set(activeIndex);
  }
  #updateFillPercents(start, end, percent) {
    for (let i = start; i < end; i++) this.#updateFillPercent(this.#refs[i], percent);
  }
  #updateFillPercent(ref, percent) {
    if (!ref) return;
    ref.style.setProperty("--chapter-fill", percent + "%");
    setAttribute(ref, "data-active", percent > 0 && percent < 100);
    setAttribute(ref, "data-ended", percent === 100);
  }
  #findActiveChapterIndex(startIndex, percent) {
    let chapterPercent = 0, cues = this.#$cues();
    if (percent === 0) return 0;
    else if (percent === 100) return cues.length - 1;
    let { seekableStart } = this.#media.$state, startTime = seekableStart(), endTime = this.#getEndTime(cues);
    for (let i = startIndex; i < cues.length; i++) {
      chapterPercent = this.#calcPercent(cues[i], percent, startTime, endTime);
      if (chapterPercent >= 0 && chapterPercent < 100) return i;
    }
    return 0;
  }
  #watchBufferedPercent() {
    this.#updateBufferedPercent(this.#bufferedPercent());
  }
  #updateBufferedPercent = animationFrameThrottle((bufferedPercent) => {
    let percent, cues = this.#$cues(), { seekableStart } = this.#media.$state, startTime = seekableStart(), endTime = this.#getEndTime(cues);
    for (let i = this.#bufferedIndex; i < this.#refs.length; i++) {
      percent = this.#calcPercent(cues[i], bufferedPercent, startTime, endTime);
      this.#refs[i]?.style.setProperty("--chapter-progress", percent + "%");
      if (percent < 100) {
        this.#bufferedIndex = i;
        break;
      }
    }
  });
  #bufferedPercent = computed(this.#calcMediaBufferedPercent.bind(this));
  #calcMediaBufferedPercent() {
    const { bufferedEnd, duration } = this.#media.$state;
    return round(Math.min(bufferedEnd() / Math.max(duration(), 1), 1), 3) * 100;
  }
  #getEndTime(cues) {
    const { seekableEnd } = this.#media.$state, endTime = seekableEnd();
    return Number.isFinite(endTime) ? endTime : cues[cues.length - 1]?.endTime || 0;
  }
  #calcPercent(cue, percent, startTime, endTime) {
    if (!cue) return 0;
    const cues = this.#$cues();
    if (cues.length === 0) return 0;
    const duration = endTime - startTime, cueStartTime = Math.max(0, cue.startTime - startTime), cueEndTime = Math.min(endTime, cue.endTime) - startTime;
    const startRatio = cueStartTime / duration, startPercent = startRatio * 100, endPercent = Math.min(1, startRatio + (cueEndTime - cueStartTime) / duration) * 100;
    return Math.max(
      0,
      round(
        percent >= endPercent ? 100 : (percent - startPercent) / (endPercent - startPercent) * 100,
        3
      )
    );
  }
  #fillGaps(cues) {
    let chapters = [], { seekableStart, seekableEnd, duration } = this.#media.$state, startTime = seekableStart(), endTime = seekableEnd();
    cues = cues.filter((cue) => cue.startTime <= endTime && cue.endTime >= startTime);
    const firstCue = cues[0];
    if (firstCue && firstCue.startTime > startTime) {
      chapters.push(new window.VTTCue(startTime, firstCue.startTime, ""));
    }
    for (let i = 0; i < cues.length - 1; i++) {
      const currentCue = cues[i], nextCue = cues[i + 1];
      chapters.push(currentCue);
      if (nextCue) {
        const timeDiff = nextCue.startTime - currentCue.endTime;
        if (timeDiff > 0) {
          chapters.push(new window.VTTCue(currentCue.endTime, currentCue.endTime + timeDiff, ""));
        }
      }
    }
    const lastCue = cues[cues.length - 1];
    if (lastCue) {
      chapters.push(lastCue);
      const endTime2 = duration();
      if (endTime2 >= 0 && endTime2 - lastCue.endTime > 1) {
        chapters.push(new window.VTTCue(lastCue.endTime, duration(), ""));
      }
    }
    return chapters;
  }
  #watchSource() {
    const { source } = this.#media.$state;
    source();
    this.#onTrackChange();
  }
  #onTrackChange() {
    if (!this.scope) return;
    const { disabled } = this.$props;
    if (disabled()) {
      this.#$cues.set([]);
      this.#activeIndex.set(0);
      this.#bufferedIndex = 0;
      return;
    }
    const track = this.#$track();
    if (track) {
      const onCuesChange = this.#onCuesChange.bind(this);
      onCuesChange();
      new EventsController(track).add("add-cue", onCuesChange).add("remove-cue", onCuesChange);
      effect(this.#watchMediaDuration.bind(this));
    }
    this.#titleRef = this.#findChapterTitleRef();
    if (this.#titleRef) effect(this.#onChapterTitleChange.bind(this));
    return () => {
      if (this.#titleRef) {
        this.#titleRef.textContent = "";
        this.#titleRef = null;
      }
    };
  }
  #watchMediaDuration() {
    this.#media.$state.duration();
    this.#onCuesChange();
  }
  #onCuesChange = functionDebounce(
    () => {
      const track = peek(this.#$track);
      if (!this.scope || !track || !track.cues.length) return;
      this.#$cues.set(this.#fillGaps(track.cues));
      this.#activeIndex.set(0);
      this.#bufferedIndex = 0;
    },
    150,
    true
  );
  #onChapterTitleChange() {
    const cue = this.activePointerCue || this.activeCue;
    if (this.#titleRef) this.#titleRef.textContent = cue?.text || "";
  }
  #findParentSlider() {
    let node = this.el;
    while (node && node.getAttribute("role") !== "slider") {
      node = node.parentElement;
    }
    return node;
  }
  #findChapterTitleRef() {
    const slider = this.#findParentSlider();
    return slider ? slider.querySelector('[data-part="chapter-title"]') : null;
  }
}
const sliderchapters__proto = SliderChapters.prototype;
prop(sliderchapters__proto, "cues");
prop(sliderchapters__proto, "activeCue");
prop(sliderchapters__proto, "activePointerCue");
method(sliderchapters__proto, "setRefs");

class MediaSliderChaptersElement extends Host(HTMLElement, SliderChapters) {
  static tagName = "media-slider-chapters";
  #template = null;
  onConnect() {
    requestScopedAnimationFrame(() => {
      if (!this.connectScope) return;
      const template = this.querySelector("template");
      if (template) {
        this.#template = template;
        effect(this.#renderTemplate.bind(this));
      }
    });
  }
  #renderTemplate() {
    if (!this.#template) return;
    const elements = cloneTemplate(this.#template, this.cues.length || 1);
    this.setRefs(elements);
  }
}

class Slider extends Component {
  static props = {
    ...SliderController.props,
    min: 0,
    max: 100,
    value: 0
  };
  static state = sliderState;
  constructor() {
    super();
    new SliderController({
      getStep: this.$props.step,
      getKeyStep: this.$props.keyStep,
      roundValue: Math.round,
      isDisabled: this.$props.disabled,
      aria: {
        valueNow: this.#getARIAValueNow.bind(this),
        valueText: this.#getARIAValueText.bind(this)
      }
    });
  }
  onSetup() {
    effect(this.#watchValue.bind(this));
    effect(this.#watchMinMax.bind(this));
  }
  // -------------------------------------------------------------------------------------------
  // Props
  // -------------------------------------------------------------------------------------------
  #getARIAValueNow() {
    const { value } = this.$state;
    return Math.round(value());
  }
  #getARIAValueText() {
    const { value, max } = this.$state;
    return round(value() / max() * 100, 2) + "%";
  }
  // -------------------------------------------------------------------------------------------
  // Watch
  // -------------------------------------------------------------------------------------------
  #watchValue() {
    const { value } = this.$props;
    this.$state.value.set(value());
  }
  #watchMinMax() {
    const { min, max } = this.$props;
    this.$state.min.set(min());
    this.$state.max.set(max());
  }
}

class MediaSliderElement extends Host(HTMLElement, Slider) {
  static tagName = "media-slider";
}

class SliderPreview extends Component {
  static props = {
    offset: 0,
    noClamp: false
  };
  #slider;
  onSetup() {
    this.#slider = useContext(sliderContext);
    const { active } = useState(Slider.state);
    this.setAttributes({
      "data-visible": active
    });
  }
  onAttach(el) {
    Object.assign(el.style, {
      position: "absolute",
      top: 0,
      left: 0,
      width: "max-content"
    });
  }
  onConnect(el) {
    const { preview } = this.#slider;
    preview.set(el);
    onDispose(() => preview.set(null));
    effect(this.#updatePlacement.bind(this));
    const resize = new ResizeObserver(this.#updatePlacement.bind(this));
    resize.observe(el);
    onDispose(() => resize.disconnect());
  }
  #updatePlacement = animationFrameThrottle(() => {
    const { disabled, orientation } = this.#slider;
    if (disabled()) return;
    const el = this.el, { offset, noClamp } = this.$props;
    if (!el) return;
    updateSliderPreviewPlacement(el, {
      clamp: !noClamp(),
      offset: offset(),
      orientation: orientation()
    });
  });
}
function updateSliderPreviewPlacement(el, {
  clamp,
  offset,
  orientation
}) {
  const computedStyle = getComputedStyle(el), width = parseFloat(computedStyle.width), height = parseFloat(computedStyle.height), styles = {
    top: null,
    right: null,
    bottom: null,
    left: null
  };
  styles[orientation === "horizontal" ? "bottom" : "left"] = `calc(100% + var(--media-slider-preview-offset, ${offset}px))`;
  if (orientation === "horizontal") {
    const widthHalf = width / 2;
    if (!clamp) {
      styles.left = `calc(var(--slider-pointer) - ${widthHalf}px)`;
    } else {
      const leftClamp = `max(0px, calc(var(--slider-pointer) - ${widthHalf}px))`, rightClamp = `calc(100% - ${width}px)`;
      styles.left = `min(${leftClamp}, ${rightClamp})`;
    }
  } else {
    const heightHalf = height / 2;
    if (!clamp) {
      styles.bottom = `calc(var(--slider-pointer) - ${heightHalf}px)`;
    } else {
      const topClamp = `max(${heightHalf}px, calc(var(--slider-pointer) - ${heightHalf}px))`, bottomClamp = `calc(100% - ${height}px)`;
      styles.bottom = `min(${topClamp}, ${bottomClamp})`;
    }
  }
  Object.assign(el.style, styles);
}

class MediaSliderPreviewElement extends Host(HTMLElement, SliderPreview) {
  static tagName = "media-slider-preview";
}

class SliderSteps extends Component {
}
class MediaSliderStepsElement extends Host(HTMLElement, SliderSteps) {
  static tagName = "media-slider-steps";
  #template = null;
  onConnect(el) {
    requestScopedAnimationFrame(() => {
      if (!this.connectScope) return;
      this.#template = el.querySelector("template");
      if (this.#template) effect(this.#render.bind(this));
    });
  }
  #render() {
    if (!this.#template) return;
    const { min, max, step } = useState(sliderState), steps = (max() - min()) / step();
    cloneTemplate(this.#template, Math.floor(steps) + 1);
  }
}

const cache = /* @__PURE__ */ new Map(), pending = /* @__PURE__ */ new Map(), warned = /* @__PURE__ */ new Set() ;
class ThumbnailsLoader {
  #media;
  #src;
  #crossOrigin;
  $images = signal([]);
  static create(src, crossOrigin) {
    const media = useMediaContext();
    return new ThumbnailsLoader(src, crossOrigin, media);
  }
  constructor(src, crossOrigin, media) {
    this.#src = src;
    this.#crossOrigin = crossOrigin;
    this.#media = media;
    effect(this.#onLoadCues.bind(this));
  }
  #onLoadCues() {
    const { canLoad } = this.#media.$state;
    if (!canLoad()) return;
    const src = this.#src();
    if (!src) return;
    if (isString(src) && cache.has(src)) {
      const cues = cache.get(src);
      cache.delete(src);
      cache.set(src, cues);
      if (cache.size > 99) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      this.$images.set(cache.get(src));
    } else if (isString(src)) {
      const crossOrigin = this.#crossOrigin(), currentKey = src + "::" + crossOrigin;
      if (!pending.has(currentKey)) {
        const promise = new Promise(async (resolve, reject) => {
          try {
            const response = await fetch(src, {
              credentials: getRequestCredentials(crossOrigin)
            }), isJSON = response.headers.get("content-type") === "application/json";
            if (isJSON) {
              const json = await response.json();
              if (isArray$1(json)) {
                if (json[0] && "text" in json[0]) {
                  resolve(this.#processVTTCues(json));
                } else {
                  for (let i = 0; i < json.length; i++) {
                    const image = json[i];
                    assert(isObject(image), `Item not an object at index ${i}`);
                    assert(
                      "url" in image && isString(image.url),
                      `Invalid or missing \`url\` property at index ${i}`
                    );
                    assert(
                      "startTime" in image && isNumber(image.startTime),
                      `Invalid or missing \`startTime\` property at index ${i}`
                    );
                  }
                  resolve(json);
                }
              } else {
                resolve(this.#processStoryboard(json));
              }
              return;
            }
            import('https://cdn.vidstack.io/captions').then(async ({ parseResponse }) => {
              try {
                const { cues } = await parseResponse(response);
                resolve(this.#processVTTCues(cues));
              } catch (e) {
                reject(e);
              }
            });
          } catch (e) {
            reject(e);
          }
        }).then((images) => {
          cache.set(currentKey, images);
          return images;
        }).catch((error) => {
          this.#onError(src, error);
        }).finally(() => {
          if (isString(currentKey)) pending.delete(currentKey);
        });
        pending.set(currentKey, promise);
      }
      pending.get(currentKey)?.then((images) => {
        this.$images.set(images || []);
      });
    } else if (isArray$1(src)) {
      try {
        this.$images.set(this.#processImages(src));
      } catch (error) {
        this.#onError(src, error);
      }
    } else {
      try {
        this.$images.set(this.#processStoryboard(src));
      } catch (error) {
        this.#onError(src, error);
      }
    }
    return () => {
      this.$images.set([]);
    };
  }
  #processImages(images) {
    const baseURL = this.#resolveBaseUrl();
    return images.map((img, i) => {
      assert(
        img.url && isString(img.url),
        `Invalid or missing \`url\` property at index ${i}`
      );
      assert(
        "startTime" in img && isNumber(img.startTime),
        `Invalid or missing \`startTime\` property at index ${i}`
      );
      return {
        ...img,
        url: isString(img.url) ? this.#resolveURL(img.url, baseURL) : img.url
      };
    });
  }
  #processStoryboard(board) {
    assert(isString(board.url), "Missing `url` in storyboard object");
    assert(isArray$1(board.tiles) && board.tiles?.length, `Empty tiles in storyboard`);
    const url = new URL(board.url), images = [];
    const tileWidth = "tile_width" in board ? board.tile_width : board.tileWidth, tileHeight = "tile_height" in board ? board.tile_height : board.tileHeight;
    for (const tile of board.tiles) {
      images.push({
        url,
        startTime: "start" in tile ? tile.start : tile.startTime,
        width: tileWidth,
        height: tileHeight,
        coords: { x: tile.x, y: tile.y }
      });
    }
    return images;
  }
  #processVTTCues(cues) {
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      assert(
        "startTime" in cue && isNumber(cue.startTime),
        `Invalid or missing \`startTime\` property at index ${i}`
      );
      assert(
        "text" in cue && isString(cue.text),
        `Invalid or missing \`text\` property at index ${i}`
      );
    }
    const images = [], baseURL = this.#resolveBaseUrl();
    for (const cue of cues) {
      const [url, hash] = cue.text.split("#"), data = this.#resolveData(hash);
      images.push({
        url: this.#resolveURL(url, baseURL),
        startTime: cue.startTime,
        endTime: cue.endTime,
        width: data?.w,
        height: data?.h,
        coords: data && isNumber(data.x) && isNumber(data.y) ? { x: data.x, y: data.y } : void 0
      });
    }
    return images;
  }
  #resolveBaseUrl() {
    let baseURL = peek(this.#src);
    if (!isString(baseURL) || !/^https?:/.test(baseURL)) {
      return location.href;
    }
    return baseURL;
  }
  #resolveURL(src, baseURL) {
    return /^https?:/.test(src) ? new URL(src) : new URL(src, baseURL);
  }
  #resolveData(hash) {
    if (!hash) return {};
    const [hashProps, values] = hash.split("="), hashValues = values?.split(","), data = {};
    if (!hashProps || !hashValues) {
      return null;
    }
    for (let i = 0; i < hashProps.length; i++) {
      const value = +hashValues[i];
      if (!isNaN(value)) data[hashProps[i]] = value;
    }
    return data;
  }
  #onError(src, error) {
    if (warned?.has(src)) return;
    this.#media.logger?.errorGroup("[vidstack] failed to load thumbnails").labelledLog("Src", src).labelledLog("Error", error).dispatch();
    warned?.add(src);
  }
}

class Thumbnail extends Component {
  static props = {
    src: null,
    time: 0,
    crossOrigin: null
  };
  static state = new State({
    src: "",
    img: null,
    thumbnails: [],
    activeThumbnail: null,
    crossOrigin: null,
    loading: false,
    error: null,
    hidden: false
  });
  media;
  #loader;
  #styleResets = [];
  onSetup() {
    this.media = useMediaContext();
    this.#loader = ThumbnailsLoader.create(this.$props.src, this.$state.crossOrigin);
    this.#watchCrossOrigin();
    this.setAttributes({
      "data-loading": this.#isLoading.bind(this),
      "data-error": this.#hasError.bind(this),
      "data-hidden": this.$state.hidden,
      "aria-hidden": $ariaBool(this.$state.hidden)
    });
  }
  onConnect(el) {
    effect(this.#watchImg.bind(this));
    effect(this.#watchHidden.bind(this));
    effect(this.#watchCrossOrigin.bind(this));
    effect(this.#onLoadStart.bind(this));
    effect(this.#onFindActiveThumbnail.bind(this));
    effect(this.#resize.bind(this));
  }
  #watchImg() {
    const img = this.$state.img();
    if (!img) return;
    new EventsController(img).add("load", this.#onLoaded.bind(this)).add("error", this.#onError.bind(this));
  }
  #watchCrossOrigin() {
    const { crossOrigin: crossOriginProp } = this.$props, { crossOrigin: crossOriginState } = this.$state, { crossOrigin: mediaCrossOrigin } = this.media.$state, crossOrigin = crossOriginProp() !== null ? crossOriginProp() : mediaCrossOrigin();
    crossOriginState.set(crossOrigin === true ? "anonymous" : crossOrigin);
  }
  #onLoadStart() {
    const { src, loading, error } = this.$state;
    if (src()) {
      loading.set(true);
      error.set(null);
    }
    return () => {
      this.#resetStyles();
      loading.set(false);
      error.set(null);
    };
  }
  #onLoaded() {
    const { loading, error } = this.$state;
    this.#resize();
    loading.set(false);
    error.set(null);
  }
  #onError(event) {
    const { loading, error } = this.$state;
    loading.set(false);
    error.set(event);
  }
  #isLoading() {
    const { loading, hidden } = this.$state;
    return !hidden() && loading();
  }
  #hasError() {
    const { error } = this.$state;
    return !isNull(error());
  }
  #watchHidden() {
    const { hidden } = this.$state, { duration } = this.media.$state, images = this.#loader.$images();
    hidden.set(this.#hasError() || !Number.isFinite(duration()) || images.length === 0);
  }
  getTime() {
    return this.$props.time();
  }
  #onFindActiveThumbnail() {
    let images = this.#loader.$images();
    if (!images.length) return;
    let time = this.getTime(), { src, activeThumbnail } = this.$state, activeIndex = -1, activeImage = null;
    for (let i = images.length - 1; i >= 0; i--) {
      const image = images[i];
      if (time >= image.startTime && (!image.endTime || time < image.endTime)) {
        activeIndex = i;
        break;
      }
    }
    if (images[activeIndex]) {
      activeImage = images[activeIndex];
    }
    activeThumbnail.set(activeImage);
    src.set(activeImage?.url.href || "");
  }
  #resize() {
    if (!this.scope || this.$state.hidden()) return;
    const rootEl = this.el, imgEl = this.$state.img(), thumbnail = this.$state.activeThumbnail();
    if (!imgEl || !thumbnail || !rootEl) return;
    let width = thumbnail.width ?? imgEl.naturalWidth, height = thumbnail?.height ?? imgEl.naturalHeight, {
      maxWidth,
      maxHeight,
      minWidth,
      minHeight,
      width: elWidth,
      height: elHeight
    } = getComputedStyle(this.el);
    if (minWidth === "100%") minWidth = parseFloat(elWidth) + "";
    if (minHeight === "100%") minHeight = parseFloat(elHeight) + "";
    let minRatio = Math.max(parseInt(minWidth) / width, parseInt(minHeight) / height), maxRatio = Math.min(
      Math.max(parseInt(minWidth), parseInt(maxWidth)) / width,
      Math.max(parseInt(minHeight), parseInt(maxHeight)) / height
    ), scale = !isNaN(maxRatio) && maxRatio < 1 ? maxRatio : minRatio > 1 ? minRatio : 1;
    this.#style(rootEl, "--thumbnail-width", `${width * scale}px`);
    this.#style(rootEl, "--thumbnail-height", `${height * scale}px`);
    this.#style(rootEl, "--thumbnail-aspect-ratio", String(round(width / height, 5)));
    this.#style(imgEl, "width", `${imgEl.naturalWidth * scale}px`);
    this.#style(imgEl, "height", `${imgEl.naturalHeight * scale}px`);
    this.#style(
      imgEl,
      "transform",
      thumbnail.coords ? `translate(-${thumbnail.coords.x * scale}px, -${thumbnail.coords.y * scale}px)` : ""
    );
    this.#style(imgEl, "max-width", "none");
  }
  #style(el, name, value) {
    el.style.setProperty(name, value);
    this.#styleResets.push(() => el.style.removeProperty(name));
  }
  #resetStyles() {
    for (const reset of this.#styleResets) reset();
    this.#styleResets = [];
  }
}

const imgTemplate = /* @__PURE__ */ createTemplate(
  '<img loading="eager" decoding="async" aria-hidden="true">'
);
class MediaThumbnailElement extends Host(HTMLElement, Thumbnail) {
  static tagName = "media-thumbnail";
  static attrs = {
    crossOrigin: "crossorigin"
  };
  #media;
  #img = this.#createImg();
  onSetup() {
    this.#media = useMediaContext();
    this.$state.img.set(this.#img);
  }
  onConnect() {
    const { src, crossOrigin } = this.$state;
    if (this.#img.parentNode !== this) {
      this.prepend(this.#img);
    }
    effect(() => {
      setAttribute(this.#img, "src", src());
      setAttribute(this.#img, "crossorigin", crossOrigin());
    });
  }
  #createImg() {
    return cloneTemplateContent(imgTemplate);
  }
}

class MediaSliderThumbnailElement extends MediaThumbnailElement {
  static tagName = "media-slider-thumbnail";
  #media;
  #slider;
  onSetup() {
    super.onSetup();
    this.#media = useMediaContext();
    this.#slider = useState(Slider.state);
  }
  onConnect() {
    super.onConnect();
    effect(this.#watchTime.bind(this));
  }
  #watchTime() {
    const { duration, clipStartTime } = this.#media.$state;
    this.time = clipStartTime() + this.#slider.pointerRate() * duration();
  }
}

class SliderValue extends Component {
  static props = {
    type: "pointer",
    format: null,
    showHours: false,
    showMs: false,
    padHours: null,
    padMinutes: null,
    decimalPlaces: 2
  };
  #format;
  #text;
  #slider;
  onSetup() {
    this.#slider = useState(Slider.state);
    this.#format = useContext(sliderValueFormatContext);
    this.#text = computed(this.getValueText.bind(this));
  }
  /**
   * Returns the current value formatted as text based on prop settings.
   */
  getValueText() {
    const {
      type,
      format: $format,
      decimalPlaces,
      padHours,
      padMinutes,
      showHours,
      showMs
    } = this.$props, { value: sliderValue, pointerValue, min, max } = this.#slider, format = $format?.() ?? this.#format.default;
    const value = type() === "current" ? sliderValue() : pointerValue();
    if (format === "percent") {
      const range = max() - min();
      const percent = value / range * 100;
      return (this.#format.percent ?? round)(percent, decimalPlaces()) + "%";
    } else if (format === "time") {
      return (this.#format.time ?? formatTime)(value, {
        padHrs: padHours(),
        padMins: padMinutes(),
        showHrs: showHours(),
        showMs: showMs()
      });
    } else {
      return (this.#format.value?.(value) ?? value.toFixed(2)) + "";
    }
  }
}
const slidervalue__proto = SliderValue.prototype;
method(slidervalue__proto, "getValueText");

class MediaSliderValueElement extends Host(HTMLElement, SliderValue) {
  static tagName = "media-slider-value";
  static attrs = {
    padMinutes: {
      converter: BOOLEAN
    }
  };
  onConnect() {
    effect(() => {
      this.textContent = this.getValueText();
    });
  }
}

class SliderVideo extends Component {
  static props = {
    src: null,
    crossOrigin: null
  };
  static state = new State({
    video: null,
    src: null,
    crossOrigin: null,
    canPlay: false,
    error: null,
    hidden: false
  });
  #media;
  #slider;
  get video() {
    return this.$state.video();
  }
  onSetup() {
    this.#media = useMediaContext();
    this.#slider = useState(Slider.state);
    this.#watchCrossOrigin();
    this.setAttributes({
      "data-loading": this.#isLoading.bind(this),
      "data-hidden": this.$state.hidden,
      "data-error": this.#hasError.bind(this),
      "aria-hidden": $ariaBool(this.$state.hidden)
    });
  }
  onAttach(el) {
    effect(this.#watchVideo.bind(this));
    effect(this.#watchSrc.bind(this));
    effect(this.#watchCrossOrigin.bind(this));
    effect(this.#watchHidden.bind(this));
    effect(this.#onSrcChange.bind(this));
    effect(this.#onUpdateTime.bind(this));
  }
  #watchVideo() {
    const video = this.$state.video();
    if (!video) return;
    if (video.readyState >= 2) this.#onCanPlay();
    new EventsController(video).add("canplay", this.#onCanPlay.bind(this)).add("error", this.#onError.bind(this));
  }
  #watchSrc() {
    const { src } = this.$state, { canLoad } = this.#media.$state;
    src.set(canLoad() ? this.$props.src() : null);
  }
  #watchCrossOrigin() {
    const { crossOrigin: crossOriginProp } = this.$props, { crossOrigin: crossOriginState } = this.$state, { crossOrigin: mediaCrossOrigin } = this.#media.$state, crossOrigin = crossOriginProp() !== null ? crossOriginProp() : mediaCrossOrigin();
    crossOriginState.set(crossOrigin === true ? "anonymous" : crossOrigin);
  }
  #isLoading() {
    const { canPlay, hidden } = this.$state;
    return !canPlay() && !hidden();
  }
  #hasError() {
    const { error } = this.$state;
    return !isNull(error);
  }
  #watchHidden() {
    const { src, hidden } = this.$state, { canLoad, duration } = this.#media.$state;
    hidden.set(canLoad() && (!src() || this.#hasError() || !Number.isFinite(duration())));
  }
  #onSrcChange() {
    const { src, canPlay, error } = this.$state;
    src();
    canPlay.set(false);
    error.set(null);
  }
  #onCanPlay(event) {
    const { canPlay, error } = this.$state;
    canPlay.set(true);
    error.set(null);
    this.dispatch("can-play", { trigger: event });
  }
  #onError(event) {
    const { canPlay, error } = this.$state;
    canPlay.set(false);
    error.set(event);
    this.dispatch("error", { trigger: event });
  }
  #onUpdateTime() {
    const { video, canPlay } = this.$state, { duration } = this.#media.$state, { pointerRate } = this.#slider, media = video(), canUpdate = canPlay() && media && Number.isFinite(duration()) && Number.isFinite(pointerRate());
    if (canUpdate) {
      media.currentTime = pointerRate() * duration();
    }
  }
}
const slidervideo__proto = SliderVideo.prototype;
prop(slidervideo__proto, "video");

const videoTemplate = /* @__PURE__ */ createTemplate(
  `<video muted playsinline preload="none" style="max-width: unset;"></video>`
);
class MediaSliderVideoElement extends Host(HTMLElement, SliderVideo) {
  static tagName = "media-slider-video";
  #media;
  #video = this.#createVideo();
  onSetup() {
    this.#media = useMediaContext();
    this.$state.video.set(this.#video);
  }
  onConnect() {
    const { canLoad } = this.#media.$state, { src, crossOrigin } = this.$state;
    if (this.#video.parentNode !== this) {
      this.prepend(this.#video);
    }
    effect(() => {
      setAttribute(this.#video, "crossorigin", crossOrigin());
      setAttribute(this.#video, "preload", canLoad() ? "auto" : "none");
      setAttribute(this.#video, "src", src());
    });
  }
  #createVideo() {
    return cloneTemplateContent(videoTemplate);
  }
}

class SpeedSlider extends Component {
  static props = {
    ...SliderController.props,
    step: 0.25,
    keyStep: 0.25,
    shiftKeyMultiplier: 2,
    min: 0,
    max: 2
  };
  static state = sliderState;
  #media;
  onSetup() {
    this.#media = useMediaContext();
    new SliderController({
      getStep: this.$props.step,
      getKeyStep: this.$props.keyStep,
      roundValue: this.#roundValue,
      isDisabled: this.#isDisabled.bind(this),
      aria: {
        valueNow: this.#getARIAValueNow.bind(this),
        valueText: this.#getARIAValueText.bind(this)
      },
      onDragValueChange: this.#onDragValueChange.bind(this),
      onValueChange: this.#onValueChange.bind(this)
    }).attach(this);
    effect(this.#watchMinMax.bind(this));
    effect(this.#watchPlaybackRate.bind(this));
  }
  onAttach(el) {
    el.setAttribute("data-media-speed-slider", "");
    setAttributeIfEmpty(el, "aria-label", "Speed");
    const { canSetPlaybackRate } = this.#media.$state;
    this.setAttributes({
      "data-supported": canSetPlaybackRate,
      "aria-hidden": $ariaBool(() => !canSetPlaybackRate())
    });
  }
  #getARIAValueNow() {
    const { value } = this.$state;
    return value();
  }
  #getARIAValueText() {
    const { value } = this.$state;
    return value() + "x";
  }
  #watchMinMax() {
    const { min, max } = this.$props;
    this.$state.min.set(min());
    this.$state.max.set(max());
  }
  #watchPlaybackRate() {
    const { playbackRate } = this.#media.$state;
    const newValue = playbackRate();
    this.$state.value.set(newValue);
    this.dispatch("value-change", { detail: newValue });
  }
  #roundValue(value) {
    return round(value, 2);
  }
  #isDisabled() {
    const { disabled } = this.$props, { canSetPlaybackRate } = this.#media.$state;
    return disabled() || !canSetPlaybackRate();
  }
  #throttledSpeedChange = functionThrottle(this.#onPlaybackRateChange.bind(this), 25);
  #onPlaybackRateChange(event) {
    if (!event.trigger) return;
    const rate = event.detail;
    this.#media.remote.changePlaybackRate(rate, event);
  }
  #onValueChange(event) {
    this.#throttledSpeedChange(event);
  }
  #onDragValueChange(event) {
    this.#throttledSpeedChange(event);
  }
}

class MediaSpeedSliderElement extends Host(HTMLElement, SpeedSlider) {
  static tagName = "media-speed-slider";
}

class MediaTimeSliderElement extends Host(HTMLElement, TimeSlider$1) {
  static tagName = "media-time-slider";
}

let VolumeSlider$1 = class VolumeSlider extends Component {
  static props = {
    ...SliderController.props,
    keyStep: 5,
    shiftKeyMultiplier: 2
  };
  static state = sliderState;
  #media;
  onSetup() {
    this.#media = useMediaContext();
    const { audioGain } = this.#media.$state;
    provideContext(sliderValueFormatContext, {
      default: "percent",
      value(value) {
        return (value * (audioGain() ?? 1)).toFixed(2);
      },
      percent(value) {
        return Math.round(value * (audioGain() ?? 1));
      }
    });
    new SliderController({
      getStep: this.$props.step,
      getKeyStep: this.$props.keyStep,
      roundValue: Math.round,
      isDisabled: this.#isDisabled.bind(this),
      aria: {
        valueMax: this.#getARIAValueMax.bind(this),
        valueNow: this.#getARIAValueNow.bind(this),
        valueText: this.#getARIAValueText.bind(this)
      },
      onDragValueChange: this.#onDragValueChange.bind(this),
      onValueChange: this.#onValueChange.bind(this)
    }).attach(this);
    effect(this.#watchVolume.bind(this));
  }
  onAttach(el) {
    el.setAttribute("data-media-volume-slider", "");
    setAttributeIfEmpty(el, "aria-label", "Volume");
    const { canSetVolume } = this.#media.$state;
    this.setAttributes({
      "data-supported": canSetVolume,
      "aria-hidden": $ariaBool(() => !canSetVolume())
    });
  }
  #getARIAValueNow() {
    const { value } = this.$state, { audioGain } = this.#media.$state;
    return Math.round(value() * (audioGain() ?? 1));
  }
  #getARIAValueText() {
    const { value, max } = this.$state, { audioGain } = this.#media.$state;
    return round(value() / max() * (audioGain() ?? 1) * 100, 2) + "%";
  }
  #getARIAValueMax() {
    const { audioGain } = this.#media.$state;
    return this.$state.max() * (audioGain() ?? 1);
  }
  #isDisabled() {
    const { disabled } = this.$props, { canSetVolume } = this.#media.$state;
    return disabled() || !canSetVolume();
  }
  #watchVolume() {
    const { muted, volume } = this.#media.$state;
    const newValue = muted() ? 0 : volume() * 100;
    this.$state.value.set(newValue);
    this.dispatch("value-change", { detail: newValue });
  }
  #throttleVolumeChange = functionThrottle(this.#onVolumeChange.bind(this), 25);
  #onVolumeChange(event) {
    if (!event.trigger) return;
    const mediaVolume = round(event.detail / 100, 3);
    this.#media.remote.changeVolume(mediaVolume, event);
  }
  #onValueChange(event) {
    this.#throttleVolumeChange(event);
  }
  #onDragValueChange(event) {
    this.#throttleVolumeChange(event);
  }
};

class MediaVolumeSliderElement extends Host(HTMLElement, VolumeSlider$1) {
  static tagName = "media-volume-slider";
}

class Spinner extends Component {
  static props = {
    size: 96,
    trackWidth: 8,
    fillPercent: 50
  };
  onConnect(el) {
    requestScopedAnimationFrame(() => {
      if (!this.connectScope) return;
      const root = el.querySelector("svg"), track = root.firstElementChild, trackFill = track.nextElementSibling;
      effect(this.#update.bind(this, root, track, trackFill));
    });
  }
  #update(root, track, trackFill) {
    const { size, trackWidth, fillPercent } = this.$props;
    setAttribute(root, "width", size());
    setAttribute(root, "height", size());
    setAttribute(track, "stroke-width", trackWidth());
    setAttribute(trackFill, "stroke-width", trackWidth());
    setAttribute(trackFill, "stroke-dashoffset", 100 - fillPercent());
  }
}
class MediaSpinnerElement extends Host(LitElement, Spinner) {
  static tagName = "media-spinner";
  render() {
    return html`
      <svg fill="none" viewBox="0 0 120 120" aria-hidden="true" data-part="root">
        <circle cx="60" cy="60" r="54" stroke="currentColor" data-part="track"></circle>
        <circle
          cx="60"
          cy="60"
          r="54"
          stroke="currentColor"
          pathLength="100"
          stroke-dasharray="100"
          data-part="track-fill"
        ></circle>
      </svg>
    `;
  }
}

class Time extends Component {
  static props = {
    type: "current",
    showHours: false,
    padHours: null,
    padMinutes: null,
    remainder: false,
    toggle: false,
    hidden: false
  };
  static state = new State({
    timeText: "",
    hidden: false
  });
  #media;
  #invert = signal(null);
  #isVisible = signal(true);
  #isIntersecting = signal(true);
  onSetup() {
    this.#media = useMediaContext();
    this.#watchTime();
    const { type } = this.$props;
    this.setAttributes({
      "data-type": type,
      "data-remainder": this.#shouldInvert.bind(this)
    });
    new IntersectionObserverController({
      callback: this.#onIntersectionChange.bind(this)
    }).attach(this);
  }
  onAttach(el) {
    if (!el.hasAttribute("role")) effect(this.#watchRole.bind(this));
    effect(this.#watchTime.bind(this));
  }
  onConnect(el) {
    onDispose(observeVisibility(el, this.#isVisible.set));
    effect(this.#watchHidden.bind(this));
    effect(this.#watchToggle.bind(this));
  }
  #onIntersectionChange(entries) {
    this.#isIntersecting.set(entries[0].isIntersecting);
  }
  #watchHidden() {
    const { hidden } = this.$props;
    this.$state.hidden.set(hidden() || !this.#isVisible() || !this.#isIntersecting());
  }
  #watchToggle() {
    if (!this.$props.toggle()) {
      this.#invert.set(null);
      return;
    }
    if (this.el) {
      onPress(this.el, this.#onToggle.bind(this));
    }
  }
  #watchTime() {
    const { hidden, timeText } = this.$state, { duration } = this.#media.$state;
    if (hidden()) return;
    const { type, padHours, padMinutes, showHours } = this.$props, seconds = this.#getSeconds(type()), $duration = duration(), shouldInvert = this.#shouldInvert();
    if (!Number.isFinite(seconds + $duration)) {
      timeText.set("LIVE");
      return;
    }
    const time = shouldInvert ? Math.max(0, $duration - seconds) : seconds, formattedTime = formatTime(time, {
      padHrs: padHours(),
      padMins: padMinutes(),
      showHrs: showHours()
    });
    timeText.set((shouldInvert ? "-" : "") + formattedTime);
  }
  #watchRole() {
    if (!this.el) return;
    const { toggle } = this.$props;
    setAttribute(this.el, "role", toggle() ? "timer" : null);
    setAttribute(this.el, "tabindex", toggle() ? 0 : null);
  }
  #getSeconds(type) {
    const { bufferedEnd, duration, currentTime } = this.#media.$state;
    switch (type) {
      case "buffered":
        return bufferedEnd();
      case "duration":
        return duration();
      default:
        return currentTime();
    }
  }
  #shouldInvert() {
    return this.$props.remainder() && this.#invert() !== false;
  }
  #onToggle(event) {
    event.preventDefault();
    if (this.#invert() === null) {
      this.#invert.set(!this.$props.remainder());
      return;
    }
    this.#invert.set((v) => !v);
  }
}

class MediaTimeElement extends Host(HTMLElement, Time) {
  static tagName = "media-time";
  onConnect() {
    effect(() => {
      this.textContent = this.$state.timeText();
    });
  }
}

class Title extends Component {
}
class MediaTitleElement extends Host(HTMLElement, Title) {
  static tagName = "media-title";
  #media;
  onSetup() {
    this.#media = useMediaContext();
  }
  onConnect() {
    effect(this.#watchTitle.bind(this));
  }
  #watchTitle() {
    const { title } = this.#media.$state;
    this.textContent = title();
  }
}

const tooltipContext = createContext();

class TooltipContent extends Component {
  static props = {
    placement: "top center",
    offset: 0,
    alignOffset: 0
  };
  constructor() {
    super();
    new FocusVisibleController();
    const { placement } = this.$props;
    this.setAttributes({
      "data-placement": placement
    });
  }
  onAttach(el) {
    this.#attach(el);
    Object.assign(el.style, {
      position: "absolute",
      top: 0,
      left: 0,
      width: "max-content"
    });
  }
  onConnect(el) {
    this.#attach(el);
    const tooltip = useContext(tooltipContext);
    onDispose(() => tooltip.detachContent(el));
    onDispose(
      requestScopedAnimationFrame(() => {
        if (!this.connectScope) return;
        effect(this.#watchPlacement.bind(this));
      })
    );
  }
  #attach(el) {
    const tooltip = useContext(tooltipContext);
    tooltip.attachContent(el);
  }
  #watchPlacement() {
    const { showing } = useContext(tooltipContext);
    if (!showing()) return;
    const { placement, offset: mainOffset, alignOffset } = this.$props;
    return autoPlacement(this.el, this.#getTrigger(), placement(), {
      offsetVarName: "media-tooltip",
      xOffset: alignOffset(),
      yOffset: mainOffset()
    });
  }
  #getTrigger() {
    return useContext(tooltipContext).trigger();
  }
}

class MediaTooltipContentElement extends Host(HTMLElement, TooltipContent) {
  static tagName = "media-tooltip-content";
}

let id = 0;
class Tooltip extends Component {
  static props = {
    showDelay: 700
  };
  #id = `media-tooltip-${++id}`;
  #trigger = signal(null);
  #content = signal(null);
  #showing = signal(false);
  constructor() {
    super();
    new FocusVisibleController();
    const { showDelay } = this.$props;
    new Popper({
      trigger: this.#trigger,
      content: this.#content,
      showDelay,
      listen(trigger, show, hide) {
        effect(() => {
          if ($keyboard()) listenEvent(trigger, "focus", show);
          listenEvent(trigger, "blur", hide);
        });
        new EventsController(trigger).add("touchstart", (e) => e.preventDefault(), { passive: false }).add("mouseenter", show).add("mouseleave", hide);
      },
      onChange: this.#onShowingChange.bind(this)
    });
  }
  onAttach(el) {
    el.style.setProperty("display", "contents");
  }
  onSetup() {
    provideContext(tooltipContext, {
      trigger: this.#trigger,
      content: this.#content,
      showing: this.#showing,
      attachTrigger: this.#attachTrigger.bind(this),
      detachTrigger: this.#detachTrigger.bind(this),
      attachContent: this.#attachContent.bind(this),
      detachContent: this.#detachContent.bind(this)
    });
  }
  #attachTrigger(el) {
    this.#trigger.set(el);
    let tooltipName = el.getAttribute("data-media-tooltip");
    if (tooltipName) {
      this.el?.setAttribute(`data-media-${tooltipName}-tooltip`, "");
    }
    setAttribute(el, "data-describedby", this.#id);
  }
  #detachTrigger(el) {
    el.removeAttribute("data-describedby");
    el.removeAttribute("aria-describedby");
    this.#trigger.set(null);
  }
  #attachContent(el) {
    el.setAttribute("id", this.#id);
    el.style.display = "none";
    setAttributeIfEmpty(el, "role", "tooltip");
    this.#content.set(el);
  }
  #detachContent(el) {
    el.removeAttribute("id");
    el.removeAttribute("role");
    this.#content.set(null);
  }
  #onShowingChange(isShowing) {
    const trigger = this.#trigger(), content = this.#content();
    if (trigger) {
      setAttribute(trigger, "aria-describedby", isShowing ? this.#id : null);
    }
    for (const el of [this.el, trigger, content]) {
      el && setAttribute(el, "data-visible", isShowing);
    }
    this.#showing.set(isShowing);
  }
}

class MediaTooltipElement extends Host(HTMLElement, Tooltip) {
  static tagName = "media-tooltip";
}

class TooltipTrigger extends Component {
  constructor() {
    super();
    new FocusVisibleController();
  }
  onConnect(el) {
    onDispose(
      requestScopedAnimationFrame(() => {
        if (!this.connectScope) return;
        this.#attach();
        const tooltip = useContext(tooltipContext);
        onDispose(() => {
          const button = this.#getButton();
          button && tooltip.detachTrigger(button);
        });
      })
    );
  }
  #attach() {
    const button = this.#getButton(), tooltip = useContext(tooltipContext);
    button && tooltip.attachTrigger(button);
  }
  #getButton() {
    const candidate = this.el.firstElementChild;
    return candidate?.localName === "button" || candidate?.getAttribute("role") === "button" ? candidate : this.el;
  }
}

class MediaTooltipTriggerElement extends Host(HTMLElement, TooltipTrigger) {
  static tagName = "media-tooltip-trigger";
  onConnect() {
    this.style.display = "contents";
  }
}

defineCustomElement(MediaLayoutElement);
defineCustomElement(MediaControlsElement);
defineCustomElement(MediaControlsGroupElement);
defineCustomElement(MediaPosterElement);
defineCustomElement(MediaAnnouncerElement);
defineCustomElement(MediaTooltipElement);
defineCustomElement(MediaTooltipTriggerElement);
defineCustomElement(MediaTooltipContentElement);
defineCustomElement(MediaPlayButtonElement);
defineCustomElement(MediaMuteButtonElement);
defineCustomElement(MediaCaptionButtonElement);
defineCustomElement(MediaFullscreenButtonElement);
defineCustomElement(MediaPIPButtonElement);
defineCustomElement(MediaSeekButtonElement);
defineCustomElement(MediaAirPlayButtonElement);
defineCustomElement(MediaGoogleCastButtonElement);
defineCustomElement(MediaToggleButtonElement);
defineCustomElement(MediaSliderElement);
defineCustomElement(MediaAudioGainSliderElement);
defineCustomElement(MediaVolumeSliderElement);
defineCustomElement(MediaTimeSliderElement);
defineCustomElement(MediaSpeedSliderElement);
defineCustomElement(MediaQualitySliderElement);
defineCustomElement(MediaSliderChaptersElement);
defineCustomElement(MediaSliderStepsElement);
defineCustomElement(MediaSliderPreviewElement);
defineCustomElement(MediaSliderValueElement);
defineCustomElement(MediaSliderThumbnailElement);
defineCustomElement(MediaSliderVideoElement);
defineCustomElement(MediaMenuElement);
defineCustomElement(MediaMenuButtonElement);
defineCustomElement(MediaMenuPortalElement);
defineCustomElement(MediaMenuItemsElement);
defineCustomElement(MediaMenuItemElement);
defineCustomElement(MediaAudioRadioGroupElement);
defineCustomElement(MediaCaptionsRadioGroupElement);
defineCustomElement(MediaSpeedRadioGroupElement);
defineCustomElement(MediaAudioGainRadioGroupElement);
defineCustomElement(MediaQualityRadioGroupElement);
defineCustomElement(MediaChaptersRadioGroupElement);
defineCustomElement(MediaRadioGroupElement);
defineCustomElement(MediaRadioElement);
defineCustomElement(MediaGestureElement);
defineCustomElement(MediaThumbnailElement);
defineCustomElement(MediaCaptionsElement);
defineCustomElement(MediaLiveButtonElement);
defineCustomElement(MediaTimeElement);
defineCustomElement(MediaTitleElement);
defineCustomElement(MediaChapterTitleElement);
defineCustomElement(MediaSpinnerElement);

var playerUi = /*#__PURE__*/Object.freeze({
  __proto__: null
});

class VidstackPlayerLayout {
  constructor(props) {
    this.props = props;
  }
  name = "vidstack";
  async load() {
    await Promise.resolve().then(function () { return _default; });
    await Promise.resolve().then(function () { return playerUi; });
  }
  create() {
    const layouts = [
      document.createElement("media-audio-layout"),
      document.createElement("media-video-layout")
    ];
    if (this.props) {
      for (const [prop, value] of Object.entries(this.props)) {
        for (const el of layouts) el[prop] = value;
      }
    }
    return layouts;
  }
}

let PlyrLayout$1 = class PlyrLayout {
  constructor(props) {
    this.props = props;
  }
  name = "plyr";
  async load() {
    await Promise.resolve().then(function () { return plyr; });
  }
  create() {
    const layout = document.createElement("media-plyr-layout");
    if (this.props) {
      for (const [prop, value] of Object.entries(this.props)) {
        layout[prop] = value;
      }
    }
    return [layout];
  }
};

const LAYOUT_LOADED = Symbol();
class VidstackPlayer {
  static async create({ target, layout, tracks, ...props }) {
    if (isString(target)) {
      target = document.querySelector(target);
    }
    if (!isHTMLElement(target)) {
      throw Error(`[vidstack] target must be of type \`HTMLElement\`, found \`${typeof target}\``);
    }
    let player = document.createElement("media-player"), provider = document.createElement("media-provider"), layouts, isTargetContainer = !isHTMLAudioElement(target) && !isHTMLVideoElement(target) && !isHTMLIFrameElement(target);
    player.setAttribute("keep-alive", "");
    if (props.poster && layout?.name !== "plyr") {
      if (!customElements.get("media-poster")) {
        const { MediaPosterElement } = await Promise.resolve().then(function () { return posterElement; });
        defineCustomElement(MediaPosterElement);
      }
      const poster = document.createElement("media-poster");
      if (layout?.name === "vidstack") poster.classList.add("vds-poster");
      provider.append(poster);
    }
    if (layout) {
      target.removeAttribute("controls");
      if (!layout[LAYOUT_LOADED]) {
        await layout.load();
        layout[LAYOUT_LOADED] = true;
      }
      layouts = await layout.create();
    }
    const title = target.getAttribute("title");
    if (title) player.setAttribute("title", title);
    const width = target.getAttribute("width"), height = target.getAttribute("height");
    if (width || height) {
      if (width) player.style.width = width;
      if (height) player.style.height = height;
      player.style.aspectRatio = "unset";
    }
    for (const attr of target.attributes) {
      const name = attr.name.replace("data-", ""), propName = kebabToCamelCase(name);
      if (propName in player) {
        player.setAttribute(name, attr.value);
      } else if (layouts?.length) {
        for (const layout2 of layouts) {
          if (propName in layout2) {
            layout2.setAttribute(name, attr.value);
          }
        }
      }
    }
    for (const [prop, value] of Object.entries(props)) {
      player[prop] = value;
    }
    if (tracks) {
      for (const track of tracks) player.textTracks.add(track);
    }
    player.append(provider);
    if (layouts) {
      for (const layout2 of layouts) player.append(layout2);
    }
    if (isTargetContainer) {
      target.append(player);
    } else {
      for (const child of [...target.children]) provider.append(child);
      target.replaceWith(player);
    }
    return player;
  }
}
{
  VidstackPlayer.Layout = {
    Default: VidstackPlayerLayout,
    Plyr: PlyrLayout$1
  };
  window.VidstackPlayer = VidstackPlayer;
}

class LibASSTextRenderer {
  constructor(loader, config) {
    this.loader = loader;
    this.config = config;
  }
  priority = 1;
  #instance = null;
  #track = null;
  #typeRE = /(ssa|ass)$/;
  canRender(track, video) {
    return !!video && !!track.src && (isString(track.type) && this.#typeRE.test(track.type) || this.#typeRE.test(track.src));
  }
  attach(video) {
    if (!video) return;
    this.loader().then(async (mod) => {
      this.#instance = new mod.default({
        ...this.config,
        video,
        subUrl: this.#track?.src || ""
      });
      new EventsController(this.#instance).add("ready", () => {
        const canvas = this.#instance?._canvas;
        if (canvas) canvas.style.pointerEvents = "none";
      }).add("error", (event) => {
        if (!this.#track) return;
        this.#track[TextTrackSymbol.readyState] = 3;
        this.#track.dispatchEvent(
          new DOMEvent("error", {
            trigger: event,
            detail: event.error
          })
        );
      });
    });
  }
  changeTrack(track) {
    if (!track || track.readyState === 3) {
      this.#freeTrack();
    } else if (this.#track !== track) {
      this.#instance?.setTrackByUrl(track.src);
      this.#track = track;
    }
  }
  detach() {
    this.#freeTrack();
  }
  #freeTrack() {
    this.#instance?.freeTrack();
    this.#track = null;
  }
}

function getCastFrameworkURL() {
  return "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
}
function hasLoadedCastFramework() {
  return !!window.cast?.framework;
}
function isCastAvailable() {
  return !!window.chrome?.cast?.isAvailable;
}
function isCastConnected() {
  return getCastContext().getCastState() === cast.framework.CastState.CONNECTED;
}
function getCastContext() {
  return window.cast.framework.CastContext.getInstance();
}
function getCastSession() {
  return getCastContext().getCurrentSession();
}
function getCastSessionMedia() {
  return getCastSession()?.getSessionObj().media[0];
}
function hasActiveCastSession(src) {
  const contentId = getCastSessionMedia()?.media.contentId;
  return contentId === src?.src;
}
function getDefaultCastOptions() {
  return {
    language: "en-US",
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    resumeSavedSession: true,
    androidReceiverCompatible: true
  };
}
function getCastErrorMessage(code) {
  const defaultMessage = `Google Cast Error Code: ${code}`;
  {
    switch (code) {
      case chrome.cast.ErrorCode.API_NOT_INITIALIZED:
        return "The API is not initialized.";
      case chrome.cast.ErrorCode.CANCEL:
        return "The operation was canceled by the user";
      case chrome.cast.ErrorCode.CHANNEL_ERROR:
        return "A channel to the receiver is not available.";
      case chrome.cast.ErrorCode.EXTENSION_MISSING:
        return "The Cast extension is not available.";
      case chrome.cast.ErrorCode.INVALID_PARAMETER:
        return "The parameters to the operation were not valid.";
      case chrome.cast.ErrorCode.RECEIVER_UNAVAILABLE:
        return "No receiver was compatible with the session request.";
      case chrome.cast.ErrorCode.SESSION_ERROR:
        return "A session could not be created, or a session was invalid.";
      case chrome.cast.ErrorCode.TIMEOUT:
        return "The operation timed out.";
      default:
        return defaultMessage;
    }
  }
}
function listenCastContextEvent(type, handler) {
  return listenEvent(getCastContext(), type, handler);
}

class GoogleCastLoader {
  name = "google-cast";
  target;
  #player;
  /**
   * @see {@link https://developers.google.com/cast/docs/reference/web_sender/cast.framework.CastContext}
   */
  get cast() {
    return getCastContext();
  }
  mediaType() {
    return "video";
  }
  canPlay(src) {
    return IS_CHROME && !IS_IOS && canGoogleCastSrc(src);
  }
  async prompt(ctx) {
    let loadEvent, openEvent, errorEvent;
    try {
      loadEvent = await this.#loadCastFramework(ctx);
      if (!this.#player) {
        this.#player = new cast.framework.RemotePlayer();
        new cast.framework.RemotePlayerController(this.#player);
      }
      openEvent = ctx.player.createEvent("google-cast-prompt-open", {
        trigger: loadEvent
      });
      ctx.player.dispatchEvent(openEvent);
      this.#notifyRemoteStateChange(ctx, "connecting", openEvent);
      await this.#showPrompt(peek(ctx.$props.googleCast));
      ctx.$state.remotePlaybackInfo.set({
        deviceName: getCastSession()?.getCastDevice().friendlyName
      });
      if (isCastConnected()) this.#notifyRemoteStateChange(ctx, "connected", openEvent);
    } catch (code) {
      const error = code instanceof Error ? code : this.#createError(
        (code + "").toUpperCase(),
        "Prompt failed."
      );
      errorEvent = ctx.player.createEvent("google-cast-prompt-error", {
        detail: error,
        trigger: openEvent ?? loadEvent,
        cancelable: true
      });
      ctx.player.dispatch(errorEvent);
      this.#notifyRemoteStateChange(
        ctx,
        isCastConnected() ? "connected" : "disconnected",
        errorEvent
      );
      throw error;
    } finally {
      ctx.player.dispatch("google-cast-prompt-close", {
        trigger: errorEvent ?? openEvent ?? loadEvent
      });
    }
  }
  async load(ctx) {
    if (!this.#player) {
      throw Error("[vidstack] google cast player was not initialized");
    }
    return new (await Promise.resolve().then(function () { return provider; })).GoogleCastProvider(this.#player, ctx);
  }
  async #loadCastFramework(ctx) {
    if (hasLoadedCastFramework()) return;
    const loadStartEvent = ctx.player.createEvent("google-cast-load-start");
    ctx.player.dispatch(loadStartEvent);
    await loadScript(getCastFrameworkURL());
    await customElements.whenDefined("google-cast-launcher");
    const loadedEvent = ctx.player.createEvent("google-cast-loaded", { trigger: loadStartEvent });
    ctx.player.dispatch(loadedEvent);
    if (!isCastAvailable()) {
      throw this.#createError("CAST_NOT_AVAILABLE", "Google Cast not available on this platform.");
    }
    return loadedEvent;
  }
  async #showPrompt(options) {
    this.#setOptions(options);
    const errorCode = await this.cast.requestSession();
    if (errorCode) {
      throw this.#createError(
        errorCode.toUpperCase(),
        getCastErrorMessage(errorCode)
      );
    }
  }
  #setOptions(options) {
    this.cast?.setOptions({
      ...getDefaultCastOptions(),
      ...options
    });
  }
  #notifyRemoteStateChange(ctx, state, trigger) {
    const detail = { type: "google-cast", state };
    ctx.notify("remote-playback-change", detail, trigger);
  }
  #createError(code, message) {
    const error = Error(message);
    error.code = code;
    return error;
  }
}

var loader = /*#__PURE__*/Object.freeze({
  __proto__: null,
  GoogleCastLoader: GoogleCastLoader
});

class AudioProvider extends HTMLMediaProvider {
  $$PROVIDER_TYPE = "AUDIO";
  get type() {
    return "audio";
  }
  airPlay;
  constructor(audio, ctx) {
    super(audio, ctx);
    scoped(() => {
      this.airPlay = new HTMLAirPlayAdapter(this.media, ctx);
    }, this.scope);
  }
  setup() {
    super.setup();
    if (this.type === "audio") this.ctx.notify("provider-setup", this);
  }
  /**
   * The native HTML `<audio>` element.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLAudioElement}
   */
  get audio() {
    return this.media;
  }
}

var provider$4 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  AudioProvider: AudioProvider
});

const toDOMEventType = (type) => camelToKebabCase(type);
class HLSController {
  #video;
  #ctx;
  #instance = null;
  #stopLiveSync = null;
  config = {};
  #callbacks = /* @__PURE__ */ new Set();
  get instance() {
    return this.#instance;
  }
  constructor(video, ctx) {
    this.#video = video;
    this.#ctx = ctx;
  }
  setup(ctor) {
    const { streamType } = this.#ctx.$state;
    const isLive = peek(streamType).includes("live"), isLiveLowLatency = peek(streamType).includes("ll-");
    this.#instance = new ctor({
      lowLatencyMode: isLiveLowLatency,
      backBufferLength: isLiveLowLatency ? 4 : isLive ? 8 : void 0,
      renderTextTracksNatively: false,
      ...this.config
    });
    const dispatcher = this.#dispatchHLSEvent.bind(this);
    for (const event of Object.values(ctor.Events)) this.#instance.on(event, dispatcher);
    this.#instance.on(ctor.Events.ERROR, this.#onError.bind(this));
    for (const callback of this.#callbacks) callback(this.#instance);
    this.#ctx.player.dispatch("hls-instance", {
      detail: this.#instance
    });
    this.#instance.attachMedia(this.#video);
    this.#instance.on(ctor.Events.AUDIO_TRACK_SWITCHED, this.#onAudioSwitch.bind(this));
    this.#instance.on(ctor.Events.LEVEL_SWITCHED, this.#onLevelSwitched.bind(this));
    this.#instance.on(ctor.Events.LEVEL_LOADED, this.#onLevelLoaded.bind(this));
    this.#instance.on(ctor.Events.LEVEL_UPDATED, this.#onLevelUpdated.bind(this));
    this.#instance.on(ctor.Events.NON_NATIVE_TEXT_TRACKS_FOUND, this.#onTracksFound.bind(this));
    this.#instance.on(ctor.Events.CUES_PARSED, this.#onCuesParsed.bind(this));
    this.#ctx.qualities[QualitySymbol.enableAuto] = this.#enableAutoQuality.bind(this);
    listenEvent(this.#ctx.qualities, "change", this.#onUserQualityChange.bind(this));
    listenEvent(this.#ctx.audioTracks, "change", this.#onUserAudioChange.bind(this));
    this.#stopLiveSync = effect(this.#liveSync.bind(this));
  }
  #createDOMEvent(type, data) {
    return new DOMEvent(toDOMEventType(type), { detail: data });
  }
  #liveSync() {
    if (!this.#ctx.$state.live()) return;
    const raf = new RAFLoop(this.#liveSyncPosition.bind(this));
    raf.start();
    return raf.stop.bind(raf);
  }
  #liveSyncPosition() {
    this.#ctx.$state.liveSyncPosition.set(this.#instance?.liveSyncPosition ?? Infinity);
  }
  #dispatchHLSEvent(type, data) {
    this.#ctx.player?.dispatch(this.#createDOMEvent(type, data));
  }
  #onTracksFound(eventType, data) {
    const event = this.#createDOMEvent(eventType, data);
    let currentTrack = -1;
    for (let i = 0; i < data.tracks.length; i++) {
      const nonNativeTrack = data.tracks[i], init = nonNativeTrack.subtitleTrack ?? nonNativeTrack.closedCaptions, track = new TextTrack({
        id: `hls-${nonNativeTrack.kind}-${i}`,
        src: init?.url,
        label: nonNativeTrack.label,
        language: init?.lang,
        kind: nonNativeTrack.kind,
        default: nonNativeTrack.default
      });
      track[TextTrackSymbol.readyState] = 2;
      track[TextTrackSymbol.onModeChange] = () => {
        if (track.mode === "showing") {
          this.#instance.subtitleTrack = i;
          currentTrack = i;
        } else if (currentTrack === i) {
          this.#instance.subtitleTrack = -1;
          currentTrack = -1;
        }
      };
      this.#ctx.textTracks.add(track, event);
    }
  }
  #onCuesParsed(eventType, data) {
    const index = this.#instance?.subtitleTrack, track = this.#ctx.textTracks.getById(`hls-${data.type}-${index}`);
    if (!track) return;
    const event = this.#createDOMEvent(eventType, data);
    for (const cue of data.cues) {
      cue.positionAlign = "auto";
      track.addCue(cue, event);
    }
  }
  #onAudioSwitch(eventType, data) {
    const track = this.#ctx.audioTracks[data.id];
    if (track) {
      const trigger = this.#createDOMEvent(eventType, data);
      this.#ctx.audioTracks[ListSymbol.select](track, true, trigger);
    }
  }
  #onLevelSwitched(eventType, data) {
    const quality = this.#ctx.qualities[data.level];
    if (quality) {
      const trigger = this.#createDOMEvent(eventType, data);
      this.#ctx.qualities[ListSymbol.select](quality, true, trigger);
    }
  }
  #onLevelUpdated(eventType, data) {
    if (data.details.totalduration > 0) {
      this.#ctx.$state.inferredLiveDVRWindow.set(data.details.totalduration);
    }
  }
  #onLevelLoaded(eventType, data) {
    if (this.#ctx.$state.canPlay()) return;
    const { type, live, totalduration: duration, targetduration } = data.details, trigger = this.#createDOMEvent(eventType, data);
    this.#ctx.notify(
      "stream-type-change",
      live ? type === "EVENT" && Number.isFinite(duration) && targetduration >= 10 ? "live:dvr" : "live" : "on-demand",
      trigger
    );
    this.#ctx.notify("duration-change", duration, trigger);
    const media = this.#instance.media;
    if (this.#instance.currentLevel === -1) {
      this.#ctx.qualities[QualitySymbol.setAuto](true, trigger);
    }
    for (const remoteTrack of this.#instance.audioTracks) {
      const localTrack = {
        id: remoteTrack.id.toString(),
        label: remoteTrack.name,
        language: remoteTrack.lang || "",
        kind: "main"
      };
      this.#ctx.audioTracks[ListSymbol.add](localTrack, trigger);
    }
    for (const level of this.#instance.levels) {
      const videoQuality = {
        id: level.id?.toString() ?? level.height + "p",
        width: level.width,
        height: level.height,
        codec: level.codecSet,
        bitrate: level.bitrate
      };
      this.#ctx.qualities[ListSymbol.add](videoQuality, trigger);
    }
    media.dispatchEvent(new DOMEvent("canplay", { trigger }));
  }
  #onError(eventType, data) {
    {
      this.#ctx.logger?.errorGroup(`[vidstack] HLS error \`${eventType}\``).labelledLog("Media Element", this.#instance?.media).labelledLog("HLS Instance", this.#instance).labelledLog("Event Type", eventType).labelledLog("Data", data).labelledLog("Src", peek(this.#ctx.$state.source)).labelledLog("Media Store", { ...this.#ctx.$state }).dispatch();
    }
    if (data.fatal) {
      switch (data.type) {
        case "mediaError":
          this.#instance?.recoverMediaError();
          break;
        default:
          this.#onFatalError(data.error);
          break;
      }
    }
  }
  #onFatalError(error) {
    this.#ctx.notify("error", {
      message: error.message,
      code: 1,
      error
    });
  }
  #enableAutoQuality() {
    if (this.#instance) this.#instance.currentLevel = -1;
  }
  #onUserQualityChange() {
    const { qualities } = this.#ctx;
    if (!this.#instance || qualities.auto) return;
    this.#instance[qualities.switch + "Level"] = qualities.selectedIndex;
    if (IS_CHROME) {
      this.#video.currentTime = this.#video.currentTime;
    }
  }
  #onUserAudioChange() {
    const { audioTracks } = this.#ctx;
    if (this.#instance && this.#instance.audioTrack !== audioTracks.selectedIndex) {
      this.#instance.audioTrack = audioTracks.selectedIndex;
    }
  }
  onInstance(callback) {
    this.#callbacks.add(callback);
    return () => this.#callbacks.delete(callback);
  }
  loadSource(src) {
    if (!isString(src.src)) return;
    this.#instance?.loadSource(src.src);
  }
  destroy() {
    this.#instance?.destroy();
    this.#instance = null;
    this.#stopLiveSync?.();
    this.#stopLiveSync = null;
    this.#ctx?.logger?.info("\u{1F3D7}\uFE0F Destroyed HLS instance");
  }
}

class HLSLibLoader {
  #lib;
  #ctx;
  #callback;
  constructor(lib, ctx, callback) {
    this.#lib = lib;
    this.#ctx = ctx;
    this.#callback = callback;
    this.#startLoading();
  }
  async #startLoading() {
    this.#ctx.logger?.info("\u{1F3D7}\uFE0F Loading HLS Library");
    const callbacks = {
      onLoadStart: this.#onLoadStart.bind(this),
      onLoaded: this.#onLoaded.bind(this),
      onLoadError: this.#onLoadError.bind(this)
    };
    let ctor = await loadHLSScript(this.#lib, callbacks);
    if (isUndefined(ctor) && !isString(this.#lib)) ctor = await importHLS(this.#lib, callbacks);
    if (!ctor) return null;
    if (!ctor.isSupported()) {
      const message = "[vidstack] `hls.js` is not supported in this environment";
      this.#ctx.logger?.error(message);
      this.#ctx.player.dispatch(new DOMEvent("hls-unsupported"));
      this.#ctx.notify("error", { message, code: 4 });
      return null;
    }
    return ctor;
  }
  #onLoadStart() {
    {
      this.#ctx.logger?.infoGroup("Starting to load `hls.js`").labelledLog("URL", this.#lib).dispatch();
    }
    this.#ctx.player.dispatch(new DOMEvent("hls-lib-load-start"));
  }
  #onLoaded(ctor) {
    {
      this.#ctx.logger?.infoGroup("Loaded `hls.js`").labelledLog("Library", this.#lib).labelledLog("Constructor", ctor).dispatch();
    }
    this.#ctx.player.dispatch(
      new DOMEvent("hls-lib-loaded", {
        detail: ctor
      })
    );
    this.#callback(ctor);
  }
  #onLoadError(e) {
    const error = coerceToError(e);
    {
      this.#ctx.logger?.errorGroup("[vidstack] Failed to load `hls.js`").labelledLog("Library", this.#lib).labelledLog("Error", e).dispatch();
    }
    this.#ctx.player.dispatch(
      new DOMEvent("hls-lib-load-error", {
        detail: error
      })
    );
    this.#ctx.notify("error", {
      message: error.message,
      code: 4,
      error
    });
  }
}
async function importHLS(loader, callbacks = {}) {
  if (isUndefined(loader)) return void 0;
  callbacks.onLoadStart?.();
  if (loader.prototype && loader.prototype !== Function) {
    callbacks.onLoaded?.(loader);
    return loader;
  }
  try {
    const ctor = (await loader())?.default;
    if (ctor && !!ctor.isSupported) {
      callbacks.onLoaded?.(ctor);
    } else {
      throw Error(
        true ? "[vidstack] failed importing `hls.js`. Dynamic import returned invalid constructor." : ""
      );
    }
    return ctor;
  } catch (err) {
    callbacks.onLoadError?.(err);
  }
  return void 0;
}
async function loadHLSScript(src, callbacks = {}) {
  if (!isString(src)) return void 0;
  callbacks.onLoadStart?.();
  try {
    await loadScript(src);
    if (!isFunction(window.Hls)) {
      throw Error(
        true ? "[vidstack] failed loading `hls.js`. Could not find a valid `Hls` constructor on window" : ""
      );
    }
    const ctor = window.Hls;
    callbacks.onLoaded?.(ctor);
    return ctor;
  } catch (err) {
    callbacks.onLoadError?.(err);
  }
  return void 0;
}

const JS_DELIVR_CDN = "https://cdn.jsdelivr.net";
class HLSProvider extends VideoProvider {
  $$PROVIDER_TYPE = "HLS";
  #ctor = null;
  #controller = new HLSController(this.video, this.ctx);
  /**
   * The `hls.js` constructor.
   */
  get ctor() {
    return this.#ctor;
  }
  /**
   * The current `hls.js` instance.
   */
  get instance() {
    return this.#controller.instance;
  }
  /**
   * Whether `hls.js` is supported in this environment.
   */
  static supported = isHLSSupported();
  get type() {
    return "hls";
  }
  get canLiveSync() {
    return true;
  }
  #library = `${JS_DELIVR_CDN}/npm/hls.js@^1.5.0/dist/hls${".js" }`;
  /**
   * The `hls.js` configuration object.
   *
   * @see {@link https://github.com/video-dev/hls.js/blob/master/docs/API.md#fine-tuning}
   */
  get config() {
    return this.#controller.config;
  }
  set config(config) {
    this.#controller.config = config;
  }
  /**
   * The `hls.js` constructor (supports dynamic imports) or a URL of where it can be found.
   *
   * @defaultValue `https://cdn.jsdelivr.net/npm/hls.js@^1.0.0/dist/hls.min.js`
   */
  get library() {
    return this.#library;
  }
  set library(library) {
    this.#library = library;
  }
  preconnect() {
    if (!isString(this.#library)) return;
    preconnect(this.#library);
  }
  setup() {
    super.setup();
    new HLSLibLoader(this.#library, this.ctx, (ctor) => {
      this.#ctor = ctor;
      this.#controller.setup(ctor);
      this.ctx.notify("provider-setup", this);
      const src = peek(this.ctx.$state.source);
      if (src) this.loadSource(src);
    });
  }
  async loadSource(src, preload) {
    if (!isString(src.src)) {
      this.removeSource();
      return;
    }
    this.media.preload = preload || "";
    this.appendSource(src, "application/x-mpegurl");
    this.#controller.loadSource(src);
    this.currentSrc = src;
  }
  /**
   * The given callback is invoked when a new `hls.js` instance is created and right before it's
   * attached to media.
   */
  onInstance(callback) {
    const instance = this.#controller.instance;
    if (instance) callback(instance);
    return this.#controller.onInstance(callback);
  }
  destroy() {
    this.#controller.destroy();
  }
}

var provider$3 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  HLSProvider: HLSProvider
});

class EmbedProvider {
  #iframe;
  src = signal("");
  /**
   * Defines which referrer is sent when fetching the resource.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLIFrameElement/referrerPolicy}
   */
  referrerPolicy = null;
  get iframe() {
    return this.#iframe;
  }
  constructor(iframe) {
    this.#iframe = iframe;
    iframe.setAttribute("frameBorder", "0");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute(
      "allow",
      "autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope"
    );
    if (this.referrerPolicy !== null) {
      iframe.setAttribute("referrerpolicy", this.referrerPolicy);
    }
  }
  setup() {
    listenEvent(window, "message", this.#onWindowMessage.bind(this));
    listenEvent(this.#iframe, "load", this.onLoad.bind(this));
    effect(this.#watchSrc.bind(this));
  }
  #watchSrc() {
    const src = this.src();
    if (!src.length) {
      this.#iframe.setAttribute("src", "");
      return;
    }
    const params = peek(() => this.buildParams());
    this.#iframe.setAttribute("src", appendParamsToURL(src, params));
  }
  postMessage(message, target) {
    this.#iframe.contentWindow?.postMessage(JSON.stringify(message), target ?? "*");
  }
  #onWindowMessage(event) {
    const origin = this.getOrigin(), isOriginMatch = (event.source === null || event.source === this.#iframe?.contentWindow) && (!isString(origin) || origin === event.origin);
    if (!isOriginMatch) return;
    try {
      const message = JSON.parse(event.data);
      if (message) this.onMessage(message, event);
      return;
    } catch (e) {
    }
    if (event.data) this.onMessage(event.data, event);
  }
}

const trackedVimeoEvents = [
  "bufferend",
  "bufferstart",
  // 'cuechange',
  "durationchange",
  "ended",
  "enterpictureinpicture",
  "error",
  "fullscreenchange",
  "leavepictureinpicture",
  "loaded",
  // 'loadeddata',
  // 'loadedmetadata',
  // 'loadstart',
  "playProgress",
  "loadProgress",
  "pause",
  "play",
  "playbackratechange",
  // 'progress',
  "qualitychange",
  "seeked",
  "seeking",
  // 'texttrackchange',
  "timeupdate",
  "volumechange",
  "waiting"
  // 'adstarted',
  // 'adcompleted',
  // 'aderror',
  // 'adskipped',
  // 'adallcompleted',
  // 'adclicked',
  // 'chapterchange',
  // 'chromecastconnected',
  // 'remoteplaybackavailabilitychange',
  // 'remoteplaybackconnecting',
  // 'remoteplaybackconnect',
  // 'remoteplaybackdisconnect',
  // 'liveeventended',
  // 'liveeventstarted',
  // 'livestreamoffline',
  // 'livestreamonline',
];

const videoIdRE$1 = /(?:https:\/\/)?(?:player\.)?vimeo(?:\.com)?\/(?:video\/)?(\d+)(?:(?:\?hash=|\?h=|\/)(.*))?/;
const infoCache = /* @__PURE__ */ new Map();
const pendingFetch$1 = /* @__PURE__ */ new Map();
function resolveVimeoVideoId(src) {
  const matches = src.match(videoIdRE$1);
  return { videoId: matches?.[1], hash: matches?.[2] };
}
async function getVimeoVideoInfo(videoId, abort, videoHash) {
  if (infoCache.has(videoId)) return infoCache.get(videoId);
  if (pendingFetch$1.has(videoId)) return pendingFetch$1.get(videoId);
  let oembedSrc = `https://vimeo.com/api/oembed.json?url=https://player.vimeo.com/video/${videoId}`;
  if (videoHash) {
    oembedSrc = oembedSrc.concat(`?h=${videoHash}`);
  }
  const promise = window.fetch(oembedSrc, {
    mode: "cors",
    signal: abort.signal
  }).then((response) => response.json()).then((data) => {
    const thumnailRegex = /vimeocdn.com\/video\/(.*)?_/, thumbnailId = data?.thumbnail_url?.match(thumnailRegex)?.[1], poster = thumbnailId ? `https://i.vimeocdn.com/video/${thumbnailId}_1920x1080.webp` : "", info = {
      title: data?.title ?? "",
      duration: data?.duration ?? 0,
      poster,
      pro: data.account_type !== "basic"
    };
    infoCache.set(videoId, info);
    return info;
  }).finally(() => pendingFetch$1.delete(videoId));
  pendingFetch$1.set(videoId, promise);
  return promise;
}

var utils$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  getVimeoVideoInfo: getVimeoVideoInfo,
  resolveVimeoVideoId: resolveVimeoVideoId
});

class VimeoProvider extends EmbedProvider {
  $$PROVIDER_TYPE = "VIMEO";
  scope = createScope();
  fullscreen;
  #ctx;
  #videoId = signal("");
  #pro = signal(false);
  #hash = null;
  #currentSrc = null;
  #fullscreenActive = false;
  #seekableRange = new TimeRange(0, 0);
  #timeRAF = new RAFLoop(this.#onAnimationFrame.bind(this));
  #currentCue = null;
  #chaptersTrack = null;
  #promises = /* @__PURE__ */ new Map();
  #videoInfoPromise = null;
  constructor(iframe, ctx) {
    super(iframe);
    this.#ctx = ctx;
    const self = this;
    this.fullscreen = {
      get active() {
        return self.#fullscreenActive;
      },
      supported: true,
      enter: () => this.#remote("requestFullscreen"),
      exit: () => this.#remote("exitFullscreen")
    };
  }
  /**
   * Whether tracking session data should be enabled on the embed, including cookies and analytics.
   * This is turned off by default to be GDPR-compliant.
   *
   * @defaultValue `false`
   */
  cookies = false;
  title = true;
  byline = true;
  portrait = true;
  color = "00ADEF";
  get type() {
    return "vimeo";
  }
  get currentSrc() {
    return this.#currentSrc;
  }
  get videoId() {
    return this.#videoId();
  }
  get hash() {
    return this.#hash;
  }
  get isPro() {
    return this.#pro();
  }
  preconnect() {
    preconnect(this.getOrigin());
  }
  setup() {
    super.setup();
    effect(this.#watchVideoId.bind(this));
    effect(this.#watchVideoInfo.bind(this));
    effect(this.#watchPro.bind(this));
    this.#ctx.notify("provider-setup", this);
  }
  destroy() {
    this.#reset();
    this.fullscreen = void 0;
    const message = "provider destroyed";
    for (const promises of this.#promises.values()) {
      for (const { reject } of promises) reject(message);
    }
    this.#promises.clear();
    this.#remote("destroy");
  }
  async play() {
    return this.#remote("play");
  }
  async pause() {
    return this.#remote("pause");
  }
  setMuted(muted) {
    this.#remote("setMuted", muted);
  }
  setCurrentTime(time) {
    this.#remote("seekTo", time);
    this.#ctx.notify("seeking", time);
  }
  setVolume(volume) {
    this.#remote("setVolume", volume);
    this.#remote("setMuted", peek(this.#ctx.$state.muted));
  }
  setPlaybackRate(rate) {
    this.#remote("setPlaybackRate", rate);
  }
  async loadSource(src) {
    if (!isString(src.src)) {
      this.#currentSrc = null;
      this.#hash = null;
      this.#videoId.set("");
      return;
    }
    const { videoId, hash } = resolveVimeoVideoId(src.src);
    this.#videoId.set(videoId ?? "");
    this.#hash = hash ?? null;
    this.#currentSrc = src;
  }
  #watchVideoId() {
    this.#reset();
    const videoId = this.#videoId();
    if (!videoId) {
      this.src.set("");
      return;
    }
    this.src.set(`${this.getOrigin()}/video/${videoId}`);
    this.#ctx.notify("load-start");
  }
  #watchVideoInfo() {
    const videoId = this.#videoId();
    if (!videoId) return;
    const promise = deferredPromise(), abort = new AbortController();
    this.#videoInfoPromise = promise;
    getVimeoVideoInfo(videoId, abort, this.#hash).then((info) => {
      promise.resolve(info);
    }).catch((e) => {
      promise.reject();
      {
        this.#ctx.logger?.warnGroup(`Failed to fetch vimeo video info for id \`${videoId}\`.`).labelledLog("Error", e).dispatch();
      }
    });
    return () => {
      promise.reject();
      abort.abort();
    };
  }
  #watchPro() {
    const isPro = this.#pro(), { $state, qualities } = this.#ctx;
    $state.canSetPlaybackRate.set(isPro);
    qualities[ListSymbol.setReadonly](!isPro);
    if (isPro) {
      return listenEvent(qualities, "change", () => {
        if (qualities.auto) return;
        const id = qualities.selected?.id;
        if (id) this.#remote("setQuality", id);
      });
    }
  }
  getOrigin() {
    return "https://player.vimeo.com";
  }
  buildParams() {
    const { keyDisabled } = this.#ctx.$props, { playsInline, nativeControls } = this.#ctx.$state, showControls = nativeControls();
    return {
      title: this.title,
      byline: this.byline,
      color: this.color,
      portrait: this.portrait,
      controls: showControls,
      h: this.hash,
      keyboard: showControls && !keyDisabled(),
      transparent: true,
      playsinline: playsInline(),
      dnt: !this.cookies
    };
  }
  #onAnimationFrame() {
    this.#remote("getCurrentTime");
  }
  // Embed will sometimes dispatch 0 at end of playback.
  #preventTimeUpdates = false;
  #onTimeUpdate(time, trigger) {
    if (this.#preventTimeUpdates && time === 0) return;
    const { realCurrentTime, paused, bufferedEnd, seekableEnd, live } = this.#ctx.$state;
    if (realCurrentTime() === time) return;
    const prevTime = realCurrentTime();
    this.#ctx.notify("time-change", time, trigger);
    if (Math.abs(prevTime - time) > 1.5) {
      this.#ctx.notify("seeking", time, trigger);
      if (!paused() && bufferedEnd() < time) {
        this.#ctx.notify("waiting", void 0, trigger);
      }
    }
    if (!live() && seekableEnd() - time < 0.01) {
      this.#ctx.notify("end", void 0, trigger);
      this.#preventTimeUpdates = true;
      setTimeout(() => {
        this.#preventTimeUpdates = false;
      }, 500);
    }
  }
  #onSeeked(time, trigger) {
    this.#ctx.notify("seeked", time, trigger);
  }
  #onLoaded(trigger) {
    const videoId = this.#videoId();
    this.#videoInfoPromise?.promise.then((info) => {
      if (!info) return;
      const { title, poster, duration, pro } = info;
      this.#pro.set(pro);
      this.#ctx.notify("title-change", title, trigger);
      this.#ctx.notify("poster-change", poster, trigger);
      this.#ctx.notify("duration-change", duration, trigger);
      this.#onReady(duration, trigger);
    }).catch(() => {
      if (videoId !== this.#videoId()) return;
      this.#remote("getVideoTitle");
      this.#remote("getDuration");
    });
  }
  #onReady(duration, trigger) {
    const { nativeControls } = this.#ctx.$state, showEmbedControls = nativeControls();
    this.#seekableRange = new TimeRange(0, duration);
    const detail = {
      buffered: new TimeRange(0, 0),
      seekable: this.#seekableRange,
      duration
    };
    this.#ctx.delegate.ready(detail, trigger);
    if (!showEmbedControls) {
      this.#remote("_hideOverlay");
    }
    this.#remote("getQualities");
    this.#remote("getChapters");
  }
  #onMethod(method, data, trigger) {
    switch (method) {
      case "getVideoTitle":
        const videoTitle = data;
        this.#ctx.notify("title-change", videoTitle, trigger);
        break;
      case "getDuration":
        const duration = data;
        if (!this.#ctx.$state.canPlay()) {
          this.#onReady(duration, trigger);
        } else {
          this.#ctx.notify("duration-change", duration, trigger);
        }
        break;
      case "getCurrentTime":
        this.#onTimeUpdate(data, trigger);
        break;
      case "getBuffered":
        if (isArray$1(data) && data.length) {
          this.#onLoadProgress(data[data.length - 1][1], trigger);
        }
        break;
      case "setMuted":
        this.#onVolumeChange(peek(this.#ctx.$state.volume), data, trigger);
        break;
      // case 'getTextTracks':
      //   this.#onTextTracksChange(data as VimeoTextTrack[], trigger);
      //   break;
      case "getChapters":
        this.#onChaptersChange(data);
        break;
      case "getQualities":
        this.#onQualitiesChange(data, trigger);
        break;
    }
    this.#getPromise(method)?.resolve();
  }
  #attachListeners() {
    for (const type of trackedVimeoEvents) {
      this.#remote("addEventListener", type);
    }
  }
  #onPause(trigger) {
    this.#timeRAF.stop();
    this.#ctx.notify("pause", void 0, trigger);
  }
  #onPlay(trigger) {
    this.#timeRAF.start();
    this.#ctx.notify("play", void 0, trigger);
  }
  #onPlayProgress(trigger) {
    const { paused } = this.#ctx.$state;
    if (!paused() && !this.#preventTimeUpdates) {
      this.#ctx.notify("playing", void 0, trigger);
    }
  }
  #onLoadProgress(buffered, trigger) {
    const detail = {
      buffered: new TimeRange(0, buffered),
      seekable: this.#seekableRange
    };
    this.#ctx.notify("progress", detail, trigger);
  }
  #onBufferStart(trigger) {
    this.#ctx.notify("waiting", void 0, trigger);
  }
  #onBufferEnd(trigger) {
    const { paused } = this.#ctx.$state;
    if (!paused()) this.#ctx.notify("playing", void 0, trigger);
  }
  #onWaiting(trigger) {
    const { paused } = this.#ctx.$state;
    if (paused()) {
      this.#ctx.notify("play", void 0, trigger);
    }
    this.#ctx.notify("waiting", void 0, trigger);
  }
  #onVolumeChange(volume, muted, trigger) {
    const detail = { volume, muted };
    this.#ctx.notify("volume-change", detail, trigger);
  }
  // #onTextTrackChange(track: VimeoTextTrack, trigger: Event) {
  //   const textTrack = this.#ctx.textTracks.toArray().find((t) => t.language === track.language);
  //   if (textTrack) textTrack.mode = track.mode;
  // }
  // #onTextTracksChange(tracks: VimeoTextTrack[], trigger: Event) {
  //   for (const init of tracks) {
  //     const textTrack = new TextTrack({
  //       ...init,
  //       label: init.label.replace('auto-generated', 'auto'),
  //     });
  //     textTrack[TextTrackSymbol.readyState] = 2;
  //     this.#ctx.textTracks.add(textTrack, trigger);
  //     textTrack.setMode(init.mode, trigger);
  //   }
  // }
  // #onCueChange(cue: VimeoTextCue, trigger: Event) {
  //   const { textTracks, $state } = this.#ctx,
  //     { currentTime } = $state,
  //     track = textTracks.selected;
  //   if (this.#currentCue) track?.removeCue(this.#currentCue, trigger);
  //   this.#currentCue = new window.VTTCue(currentTime(), Number.MAX_SAFE_INTEGER, cue.text);
  //   track?.addCue(this.#currentCue, trigger);
  // }
  #onChaptersChange(chapters) {
    this.#removeChapters();
    if (!chapters.length) return;
    const track = new TextTrack({
      kind: "chapters",
      default: true
    }), { seekableEnd } = this.#ctx.$state;
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i], nextChapter = chapters[i + 1];
      track.addCue(
        new window.VTTCue(
          chapter.startTime,
          nextChapter?.startTime ?? seekableEnd(),
          chapter.title
        )
      );
    }
    this.#chaptersTrack = track;
    this.#ctx.textTracks.add(track);
  }
  #removeChapters() {
    if (!this.#chaptersTrack) return;
    this.#ctx.textTracks.remove(this.#chaptersTrack);
    this.#chaptersTrack = null;
  }
  #onQualitiesChange(qualities, trigger) {
    this.#ctx.qualities[QualitySymbol.enableAuto] = qualities.some((q) => q.id === "auto") ? () => this.#remote("setQuality", "auto") : void 0;
    for (const quality of qualities) {
      if (quality.id === "auto") continue;
      const height = +quality.id.slice(0, -1);
      if (isNaN(height)) continue;
      this.#ctx.qualities[ListSymbol.add](
        {
          id: quality.id,
          width: height * (16 / 9),
          height,
          codec: "avc1,h.264",
          bitrate: -1
        },
        trigger
      );
    }
    this.#onQualityChange(
      qualities.find((q) => q.active),
      trigger
    );
  }
  #onQualityChange({ id } = {}, trigger) {
    if (!id) return;
    const isAuto = id === "auto", newQuality = this.#ctx.qualities.getById(id);
    if (isAuto) {
      this.#ctx.qualities[QualitySymbol.setAuto](isAuto, trigger);
      this.#ctx.qualities[ListSymbol.select](void 0, true, trigger);
    } else {
      this.#ctx.qualities[ListSymbol.select](newQuality ?? void 0, true, trigger);
    }
  }
  #onEvent(event, payload, trigger) {
    switch (event) {
      case "ready":
        this.#attachListeners();
        break;
      case "loaded":
        this.#onLoaded(trigger);
        break;
      case "play":
        this.#onPlay(trigger);
        break;
      case "playProgress":
        this.#onPlayProgress(trigger);
        break;
      case "pause":
        this.#onPause(trigger);
        break;
      case "loadProgress":
        this.#onLoadProgress(payload.seconds, trigger);
        break;
      case "waiting":
        this.#onWaiting(trigger);
        break;
      case "bufferstart":
        this.#onBufferStart(trigger);
        break;
      case "bufferend":
        this.#onBufferEnd(trigger);
        break;
      case "volumechange":
        this.#onVolumeChange(payload.volume, peek(this.#ctx.$state.muted), trigger);
        break;
      case "durationchange":
        this.#seekableRange = new TimeRange(0, payload.duration);
        this.#ctx.notify("duration-change", payload.duration, trigger);
        break;
      case "playbackratechange":
        this.#ctx.notify("rate-change", payload.playbackRate, trigger);
        break;
      case "qualitychange":
        this.#onQualityChange(payload, trigger);
        break;
      case "fullscreenchange":
        this.#fullscreenActive = payload.fullscreen;
        this.#ctx.notify("fullscreen-change", payload.fullscreen, trigger);
        break;
      case "enterpictureinpicture":
        this.#ctx.notify("picture-in-picture-change", true, trigger);
        break;
      case "leavepictureinpicture":
        this.#ctx.notify("picture-in-picture-change", false, trigger);
        break;
      case "ended":
        this.#ctx.notify("end", void 0, trigger);
        break;
      case "error":
        this.#onError(payload, trigger);
        break;
      case "seek":
      case "seeked":
        this.#onSeeked(payload.seconds, trigger);
        break;
    }
  }
  #onError(error, trigger) {
    const { message, method } = error;
    if (method === "setPlaybackRate") {
      this.#pro.set(false);
    }
    if (method) {
      this.#getPromise(method)?.reject(message);
    }
    {
      this.#ctx.logger?.errorGroup(`[vimeo]: ${message}`).labelledLog("Error", error).labelledLog("Provider", this).labelledLog("Event", trigger).dispatch();
    }
  }
  onMessage(message, event) {
    if (message.event) {
      this.#onEvent(message.event, message.data, event);
    } else if (message.method) {
      this.#onMethod(message.method, message.value, event);
    }
  }
  onLoad() {
  }
  async #remote(command, arg) {
    let promise = deferredPromise(), promises = this.#promises.get(command);
    if (!promises) this.#promises.set(command, promises = []);
    promises.push(promise);
    this.postMessage({
      method: command,
      value: arg
    });
    return promise.promise;
  }
  #reset() {
    this.#timeRAF.stop();
    this.#seekableRange = new TimeRange(0, 0);
    this.#videoInfoPromise = null;
    this.#currentCue = null;
    this.#pro.set(false);
    this.#removeChapters();
  }
  #getPromise(command) {
    return this.#promises.get(command)?.shift();
  }
}

var provider$2 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  VimeoProvider: VimeoProvider
});

const YouTubePlayerState = {
  Unstarted: -1,
  Ended: 0,
  Playing: 1,
  Paused: 2,
  Buffering: 3,
  Cued: 5
};

const videoIdRE = /(?:youtu\.be|youtube|youtube\.com|youtube-nocookie\.com)\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|)((?:\w|-){11})/;
const posterCache = /* @__PURE__ */ new Map();
const pendingFetch = /* @__PURE__ */ new Map();
function resolveYouTubeVideoId(src) {
  return src.match(videoIdRE)?.[1];
}
async function findYouTubePoster(videoId, abort) {
  if (posterCache.has(videoId)) return posterCache.get(videoId);
  if (pendingFetch.has(videoId)) return pendingFetch.get(videoId);
  const pending = new Promise(async (resolve) => {
    const sizes = ["maxresdefault", "sddefault", "hqdefault"];
    for (const size of sizes) {
      for (const webp of [true, false]) {
        const url = resolveYouTubePosterURL(videoId, size, webp), response = await fetch(url, {
          mode: "no-cors",
          signal: abort.signal
        });
        if (response.status < 400) {
          posterCache.set(videoId, url);
          resolve(url);
          return;
        }
      }
    }
  }).catch(() => "").finally(() => pendingFetch.delete(videoId));
  pendingFetch.set(videoId, pending);
  return pending;
}
function resolveYouTubePosterURL(videoId, size, webp) {
  const type = webp ? "webp" : "jpg";
  return `https://i.ytimg.com/${webp ? "vi_webp" : "vi"}/${videoId}/${size}.${type}`;
}

var utils = /*#__PURE__*/Object.freeze({
  __proto__: null,
  findYouTubePoster: findYouTubePoster,
  resolveYouTubeVideoId: resolveYouTubeVideoId
});

class YouTubeProvider extends EmbedProvider {
  $$PROVIDER_TYPE = "YOUTUBE";
  scope = createScope();
  #ctx;
  #videoId = signal("");
  #state = -1;
  #currentSrc = null;
  #seekingTimer = -1;
  #invalidPlay = false;
  #promises = /* @__PURE__ */ new Map();
  constructor(iframe, ctx) {
    super(iframe);
    this.#ctx = ctx;
  }
  /**
   * Sets the player's interface language. The parameter value is an ISO 639-1 two-letter
   * language code or a fully specified locale. For example, fr and fr-ca are both valid values.
   * Other language input codes, such as IETF language tags (BCP 47) might also be handled properly.
   *
   * The interface language is used for tooltips in the player and also affects the default caption
   * track. Note that YouTube might select a different caption track language for a particular
   * user based on the user's individual language preferences and the availability of caption tracks.
   *
   * @defaultValue 'en'
   */
  language = "en";
  color = "red";
  /**
   * Whether cookies should be enabled on the embed. This is turned off by default to be
   * GDPR-compliant.
   *
   * @defaultValue `false`
   */
  cookies = false;
  get currentSrc() {
    return this.#currentSrc;
  }
  get type() {
    return "youtube";
  }
  get videoId() {
    return this.#videoId();
  }
  preconnect() {
    preconnect(this.getOrigin());
  }
  setup() {
    super.setup();
    effect(this.#watchVideoId.bind(this));
    this.#ctx.notify("provider-setup", this);
  }
  destroy() {
    this.#reset();
    const message = "provider destroyed";
    for (const promises of this.#promises.values()) {
      for (const { reject } of promises) reject(message);
    }
    this.#promises.clear();
  }
  async play() {
    return this.#remote("playVideo");
  }
  #playFail(message) {
    this.#getPromise("playVideo")?.reject(message);
  }
  async pause() {
    return this.#remote("pauseVideo");
  }
  #pauseFail(message) {
    this.#getPromise("pauseVideo")?.reject(message);
  }
  setMuted(muted) {
    if (muted) this.#remote("mute");
    else this.#remote("unMute");
  }
  setCurrentTime(time) {
    this.#remote("seekTo", time);
    this.#ctx.notify("seeking", time);
  }
  setVolume(volume) {
    this.#remote("setVolume", volume * 100);
  }
  setPlaybackRate(rate) {
    this.#remote("setPlaybackRate", rate);
  }
  async loadSource(src) {
    if (!isString(src.src)) {
      this.#currentSrc = null;
      this.#videoId.set("");
      return;
    }
    const videoId = resolveYouTubeVideoId(src.src);
    this.#videoId.set(videoId ?? "");
    this.#currentSrc = src;
  }
  getOrigin() {
    return !this.cookies ? "https://www.youtube-nocookie.com" : "https://www.youtube.com";
  }
  #watchVideoId() {
    this.#reset();
    const videoId = this.#videoId();
    if (!videoId) {
      this.src.set("");
      return;
    }
    this.src.set(`${this.getOrigin()}/embed/${videoId}`);
    this.#ctx.notify("load-start");
  }
  buildParams() {
    const { keyDisabled } = this.#ctx.$props, { muted, playsInline, nativeControls } = this.#ctx.$state, showControls = nativeControls();
    return {
      autoplay: 0,
      cc_lang_pref: this.language,
      cc_load_policy: showControls ? 1 : void 0,
      color: this.color,
      controls: showControls ? 1 : 0,
      disablekb: !showControls || keyDisabled() ? 1 : 0,
      enablejsapi: 1,
      fs: 1,
      hl: this.language,
      iv_load_policy: showControls ? 1 : 3,
      mute: muted() ? 1 : 0,
      playsinline: playsInline() ? 1 : 0
    };
  }
  #remote(command, arg) {
    let promise = deferredPromise(), promises = this.#promises.get(command);
    if (!promises) this.#promises.set(command, promises = []);
    promises.push(promise);
    this.postMessage({
      event: "command",
      func: command,
      args: arg ? [arg] : void 0
    });
    return promise.promise;
  }
  onLoad() {
    window.setTimeout(() => this.postMessage({ event: "listening" }), 100);
  }
  #onReady(trigger) {
    this.#ctx.notify("loaded-metadata");
    this.#ctx.notify("loaded-data");
    this.#ctx.delegate.ready(void 0, trigger);
  }
  #onPause(trigger) {
    this.#getPromise("pauseVideo")?.resolve();
    this.#ctx.notify("pause", void 0, trigger);
  }
  #onTimeUpdate(time, trigger) {
    const { duration, realCurrentTime } = this.#ctx.$state, hasEnded = this.#state === YouTubePlayerState.Ended, boundTime = hasEnded ? duration() : time;
    this.#ctx.notify("time-change", boundTime, trigger);
    if (!hasEnded && Math.abs(boundTime - realCurrentTime()) > 1) {
      this.#ctx.notify("seeking", boundTime, trigger);
    }
  }
  #onProgress(buffered, seekable, trigger) {
    const detail = {
      buffered: new TimeRange(0, buffered),
      seekable
    };
    this.#ctx.notify("progress", detail, trigger);
    const { seeking, realCurrentTime } = this.#ctx.$state;
    if (seeking() && buffered > realCurrentTime()) {
      this.#onSeeked(trigger);
    }
  }
  #onSeeked(trigger) {
    const { paused, realCurrentTime } = this.#ctx.$state;
    window.clearTimeout(this.#seekingTimer);
    this.#seekingTimer = window.setTimeout(
      () => {
        this.#ctx.notify("seeked", realCurrentTime(), trigger);
        this.#seekingTimer = -1;
      },
      paused() ? 100 : 0
    );
  }
  #onEnded(trigger) {
    const { seeking } = this.#ctx.$state;
    if (seeking()) this.#onSeeked(trigger);
    this.#ctx.notify("pause", void 0, trigger);
    this.#ctx.notify("end", void 0, trigger);
  }
  #onStateChange(state, trigger) {
    const { paused, seeking } = this.#ctx.$state, isPlaying = state === YouTubePlayerState.Playing, isBuffering = state === YouTubePlayerState.Buffering, isPendingPlay = this.#isPending("playVideo"), isPlay = paused() && (isBuffering || isPlaying);
    if (isBuffering) this.#ctx.notify("waiting", void 0, trigger);
    if (seeking() && isPlaying) {
      this.#onSeeked(trigger);
    }
    if (this.#invalidPlay && isPlaying) {
      this.pause();
      this.#invalidPlay = false;
      this.setMuted(this.#ctx.$state.muted());
      return;
    }
    if (!isPendingPlay && isPlay) {
      this.#invalidPlay = true;
      this.setMuted(true);
      return;
    }
    if (isPlay) {
      this.#getPromise("playVideo")?.resolve();
      this.#ctx.notify("play", void 0, trigger);
    }
    switch (state) {
      case YouTubePlayerState.Cued:
        this.#onReady(trigger);
        break;
      case YouTubePlayerState.Playing:
        this.#ctx.notify("playing", void 0, trigger);
        break;
      case YouTubePlayerState.Paused:
        this.#onPause(trigger);
        break;
      case YouTubePlayerState.Ended:
        this.#onEnded(trigger);
        break;
    }
    this.#state = state;
  }
  onMessage({ info }, event) {
    if (!info) return;
    const { title, intrinsicDuration, playbackRate } = this.#ctx.$state;
    if (isObject(info.videoData) && info.videoData.title !== title()) {
      this.#ctx.notify("title-change", info.videoData.title, event);
    }
    if (isNumber(info.duration) && info.duration !== intrinsicDuration()) {
      if (isNumber(info.videoLoadedFraction)) {
        const buffered = info.progressState?.loaded ?? info.videoLoadedFraction * info.duration, seekable = new TimeRange(0, info.duration);
        this.#onProgress(buffered, seekable, event);
      }
      this.#ctx.notify("duration-change", info.duration, event);
    }
    if (isNumber(info.playbackRate) && info.playbackRate !== playbackRate()) {
      this.#ctx.notify("rate-change", info.playbackRate, event);
    }
    if (info.progressState) {
      const { current, seekableStart, seekableEnd, loaded, duration } = info.progressState;
      this.#onTimeUpdate(current, event);
      this.#onProgress(loaded, new TimeRange(seekableStart, seekableEnd), event);
      if (duration !== intrinsicDuration()) {
        this.#ctx.notify("duration-change", duration, event);
      }
    }
    if (isNumber(info.volume) && isBoolean(info.muted) && !this.#invalidPlay) {
      const detail = {
        muted: info.muted,
        volume: info.volume / 100
      };
      this.#ctx.notify("volume-change", detail, event);
    }
    if (isNumber(info.playerState) && info.playerState !== this.#state) {
      this.#onStateChange(info.playerState, event);
    }
  }
  #reset() {
    this.#state = -1;
    this.#seekingTimer = -1;
    this.#invalidPlay = false;
  }
  #getPromise(command) {
    return this.#promises.get(command)?.shift();
  }
  #isPending(command) {
    return Boolean(this.#promises.get(command)?.length);
  }
}

var provider$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  YouTubeProvider: YouTubeProvider
});

var Icon$24 = `<path fill-rule="evenodd" clip-rule="evenodd" d="M6 7C5.63181 7 5.33333 7.29848 5.33333 7.66667V14.8667C5.33333 14.9403 5.39361 14.9999 5.46724 15.0009C10.8844 15.0719 15.2614 19.449 15.3325 24.8661C15.3334 24.9397 15.393 25 15.4667 25H26C26.3682 25 26.6667 24.7015 26.6667 24.3333V7.66667C26.6667 7.29848 26.3682 7 26 7H6ZM17.0119 22.2294C17.0263 22.29 17.0802 22.3333 17.1425 22.3333H23.3333C23.7015 22.3333 24 22.0349 24 21.6667V10.3333C24 9.96514 23.7015 9.66667 23.3333 9.66667H8.66667C8.29848 9.66667 8 9.96514 8 10.3333V13.1909C8 13.2531 8.04332 13.3071 8.10392 13.3214C12.5063 14.3618 15.9715 17.827 17.0119 22.2294Z" fill="currentColor"/> <path d="M13.2 25C13.2736 25 13.3334 24.9398 13.3322 24.8661C13.2615 20.5544 9.77889 17.0718 5.46718 17.0011C5.39356 16.9999 5.33333 17.0597 5.33333 17.1333V18.8667C5.33333 18.9403 5.39348 18.9999 5.4671 19.0015C8.67465 19.0716 11.2617 21.6587 11.3319 24.8662C11.3335 24.9399 11.393 25 11.4667 25H13.2Z" fill="currentColor"/> <path d="M5.33333 21.1333C5.33333 21.0597 5.39332 20.9998 5.46692 21.0022C7.57033 21.0712 9.26217 22.763 9.33114 24.8664C9.33356 24.94 9.27364 25 9.2 25H6C5.63181 25 5.33333 24.7015 5.33333 24.3333V21.1333Z" fill="currentColor"/>`;

const svgTemplate = /* @__PURE__ */ createTemplate(
  `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"></svg>`
);
function insertContent(container, $state) {
  const icon = cloneTemplateContent(svgTemplate);
  icon.innerHTML = Icon$24;
  container.append(icon);
  const text = document.createElement("span");
  text.classList.add("vds-google-cast-info");
  container.append(text);
  const deviceName = document.createElement("span");
  deviceName.classList.add("vds-google-cast-device-name");
  effect(() => {
    const { remotePlaybackInfo } = $state, info = remotePlaybackInfo();
    if (info?.deviceName) {
      deviceName.textContent = info.deviceName;
      text.append("Google Cast on ", deviceName);
    }
    return () => {
      text.textContent = "";
    };
  });
}

var providerCastDisplay = /*#__PURE__*/Object.freeze({
  __proto__: null,
  insertContent: insertContent
});

var Icon$0 = `<path fill-rule="evenodd" clip-rule="evenodd" d="M15.0007 28.7923C15.0007 29.0152 14.9774 29.096 14.9339 29.1775C14.8903 29.259 14.8263 29.323 14.7449 29.3665C14.6634 29.4101 14.5826 29.4333 14.3597 29.4333H12.575C12.3521 29.4333 12.2713 29.4101 12.1898 29.3665C12.1083 29.323 12.0443 29.259 12.0008 29.1775C11.9572 29.096 11.934 29.0152 11.934 28.7923V12.2993L5.97496 12.3C5.75208 12.3 5.67125 12.2768 5.58977 12.2332C5.50829 12.1896 5.44434 12.1257 5.40077 12.0442C5.35719 11.9627 5.33398 11.8819 5.33398 11.659V9.87429C5.33398 9.65141 5.35719 9.57059 5.40077 9.48911C5.44434 9.40762 5.50829 9.34368 5.58977 9.3001C5.67125 9.25652 5.75208 9.23332 5.97496 9.23332H26.0263C26.2492 9.23332 26.33 9.25652 26.4115 9.3001C26.493 9.34368 26.557 9.40762 26.6005 9.48911C26.6441 9.57059 26.6673 9.65141 26.6673 9.87429V11.659C26.6673 11.8819 26.6441 11.9627 26.6005 12.0442C26.557 12.1257 26.493 12.1896 26.4115 12.2332C26.33 12.2768 26.2492 12.3 26.0263 12.3L20.067 12.2993L20.0673 28.7923C20.0673 29.0152 20.0441 29.096 20.0005 29.1775C19.957 29.259 19.893 29.323 19.8115 29.3665C19.73 29.4101 19.6492 29.4333 19.4263 29.4333H17.6416C17.4187 29.4333 17.3379 29.4101 17.2564 29.3665C17.175 29.323 17.111 29.259 17.0674 29.1775C17.0239 29.096 17.0007 29.0152 17.0007 28.7923L17 22.7663H15L15.0007 28.7923Z" fill="currentColor"/> <path d="M16.0007 7.89998C17.4734 7.89998 18.6673 6.70608 18.6673 5.23332C18.6673 3.76056 17.4734 2.56665 16.0007 2.56665C14.5279 2.56665 13.334 3.76056 13.334 5.23332C13.334 6.70608 14.5279 7.89998 16.0007 7.89998Z" fill="currentColor"/>`;

var Icon$5 = `<path d="M5.33334 6.00001C5.33334 5.63182 5.63181 5.33334 6 5.33334H26C26.3682 5.33334 26.6667 5.63182 26.6667 6.00001V20.6667C26.6667 21.0349 26.3682 21.3333 26 21.3333H23.7072C23.4956 21.3333 23.2966 21.233 23.171 21.0628L22.1859 19.7295C21.8607 19.2894 22.1749 18.6667 22.7221 18.6667H23.3333C23.7015 18.6667 24 18.3682 24 18V8.66668C24 8.29849 23.7015 8.00001 23.3333 8.00001H8.66667C8.29848 8.00001 8 8.29849 8 8.66668V18C8 18.3682 8.29848 18.6667 8.66667 18.6667H9.29357C9.84072 18.6667 10.1549 19.2894 9.82976 19.7295L8.84467 21.0628C8.71898 21.233 8.52 21.3333 8.30848 21.3333H6C5.63181 21.3333 5.33334 21.0349 5.33334 20.6667V6.00001Z" fill="currentColor"/> <path d="M8.78528 25.6038C8.46013 26.0439 8.77431 26.6667 9.32147 26.6667L22.6785 26.6667C23.2256 26.6667 23.5398 26.0439 23.2146 25.6038L16.5358 16.5653C16.2693 16.2046 15.73 16.2047 15.4635 16.5653L8.78528 25.6038Z" fill="currentColor"/>`;

var Icon$8 = `<path d="M17.4853 18.9093C17.4853 19.0281 17.6289 19.0875 17.7129 19.0035L22.4185 14.2979C22.6788 14.0376 23.1009 14.0376 23.3613 14.2979L24.7755 15.7122C25.0359 15.9725 25.0359 16.3946 24.7755 16.655L16.2902 25.1403C16.0299 25.4006 15.6078 25.4006 15.3474 25.1403L13.9332 23.726L13.9319 23.7247L6.86189 16.6547C6.60154 16.3944 6.60154 15.9723 6.86189 15.7119L8.2761 14.2977C8.53645 14.0373 8.95856 14.0373 9.21891 14.2977L13.9243 19.0031C14.0083 19.0871 14.1519 19.0276 14.1519 18.9088L14.1519 6.00004C14.1519 5.63185 14.4504 5.33337 14.8186 5.33337L16.8186 5.33337C17.1868 5.33337 17.4853 5.63185 17.4853 6.00004L17.4853 18.9093Z" fill="currentColor"/>`;

var Icon$11 = `<path d="M13.0908 14.3334C12.972 14.3334 12.9125 14.1898 12.9965 14.1058L17.7021 9.40022C17.9625 9.13987 17.9625 8.71776 17.7021 8.45741L16.2879 7.04319C16.0275 6.78284 15.6054 6.78284 15.3451 7.04319L6.8598 15.5285C6.59945 15.7888 6.59945 16.2109 6.8598 16.4713L8.27401 17.8855L8.27536 17.8868L15.3453 24.9568C15.6057 25.2172 16.0278 25.2172 16.2881 24.9568L17.7024 23.5426C17.9627 23.2822 17.9627 22.8601 17.7024 22.5998L12.9969 17.8944C12.9129 17.8104 12.9724 17.6668 13.0912 17.6668L26 17.6668C26.3682 17.6668 26.6667 17.3683 26.6667 17.0001V15.0001C26.6667 14.6319 26.3682 14.3334 26 14.3334L13.0908 14.3334Z" fill="currentColor"/>`;

var Icon$13 = `<path d="M14.1521 13.0929C14.1521 12.9741 14.0085 12.9147 13.9245 12.9987L9.21891 17.7043C8.95856 17.9646 8.53645 17.9646 8.2761 17.7043L6.86189 16.29C6.60154 16.0297 6.60154 15.6076 6.86189 15.3472L15.3472 6.86195C15.6075 6.6016 16.0296 6.6016 16.29 6.86195L17.7042 8.27616L17.7055 8.27751L24.7755 15.3475C25.0359 15.6078 25.0359 16.0299 24.7755 16.2903L23.3613 17.7045C23.1009 17.9649 22.6788 17.9649 22.4185 17.7045L17.7131 12.9991C17.6291 12.9151 17.4855 12.9746 17.4855 13.0934V26.0022C17.4855 26.3704 17.187 26.6688 16.8188 26.6688H14.8188C14.4506 26.6688 14.1521 26.3704 14.1521 26.0022L14.1521 13.0929Z" fill="currentColor"/>`;

var Icon$16 = `<path d="M16.6927 25.3346C16.3245 25.3346 16.026 25.0361 16.026 24.6679L16.026 7.3346C16.026 6.96641 16.3245 6.66794 16.6927 6.66794L18.6927 6.66794C19.0609 6.66794 19.3594 6.96642 19.3594 7.3346L19.3594 24.6679C19.3594 25.0361 19.0609 25.3346 18.6927 25.3346H16.6927Z" fill="currentColor"/> <path d="M24.026 25.3346C23.6578 25.3346 23.3594 25.0361 23.3594 24.6679L23.3594 7.3346C23.3594 6.96641 23.6578 6.66794 24.026 6.66794L26.026 6.66794C26.3942 6.66794 26.6927 6.96642 26.6927 7.3346V24.6679C26.6927 25.0361 26.3942 25.3346 26.026 25.3346H24.026Z" fill="currentColor"/> <path d="M5.48113 23.9407C5.38584 24.2963 5.59689 24.6619 5.95254 24.7572L7.88439 25.2748C8.24003 25.3701 8.60559 25.159 8.70089 24.8034L13.1871 8.06067C13.2824 7.70503 13.0713 7.33947 12.7157 7.24417L10.7838 6.72654C10.4282 6.63124 10.0626 6.8423 9.96733 7.19794L5.48113 23.9407Z" fill="currentColor"/>`;

var Icon$19 = `<path fill-rule="evenodd" clip-rule="evenodd" d="M24.9266 7.57992C25.015 7.60672 25.0886 7.64746 25.2462 7.80506L26.956 9.51488C27.1136 9.67248 27.1543 9.74604 27.1811 9.83447C27.2079 9.9229 27.2079 10.0133 27.1811 10.1018C27.1543 10.1902 27.1136 10.2638 26.956 10.4214L13.1822 24.1951C13.0246 24.3527 12.951 24.3935 12.8626 24.4203C12.797 24.4402 12.7304 24.4453 12.6642 24.4357L12.7319 24.4203C12.6435 24.4471 12.553 24.4471 12.4646 24.4203C12.3762 24.3935 12.3026 24.3527 12.145 24.1951L5.04407 17.0942C4.88647 16.9366 4.84573 16.863 4.81893 16.7746C4.79213 16.6862 4.79213 16.5957 4.81893 16.5073C4.84573 16.4189 4.88647 16.3453 5.04407 16.1877L6.7539 14.4779C6.9115 14.3203 6.98506 14.2796 7.07349 14.2528C7.16191 14.226 7.25235 14.226 7.34078 14.2528C7.42921 14.2796 7.50277 14.3203 7.66037 14.4779L12.6628 19.4808L24.3397 7.80506C24.4973 7.64746 24.5709 7.60672 24.6593 7.57992C24.7477 7.55311 24.8382 7.55311 24.9266 7.57992Z" fill="currentColor"/>`;

var Icon$22 = `<path d="M17.947 16.095C17.999 16.043 17.999 15.9585 17.947 15.9065L11.6295 9.58899C11.3691 9.32864 11.3691 8.90653 11.6295 8.64618L13.2323 7.04341C13.4926 6.78306 13.9147 6.78306 14.1751 7.04341L21.0289 13.8973C21.0392 13.9064 21.0493 13.9158 21.0591 13.9257L22.6619 15.5285C22.9223 15.7888 22.9223 16.2109 22.6619 16.4713L14.1766 24.9565C13.9163 25.2169 13.4942 25.2169 13.2338 24.9565L11.631 23.3538C11.3707 23.0934 11.3707 22.6713 11.631 22.411L17.947 16.095Z" fill="currentColor"/>`;

var Icon$26 = `<path d="M8 28.0003C8 27.6321 8.29848 27.3336 8.66667 27.3336H23.3333C23.7015 27.3336 24 27.6321 24 28.0003V29.3336C24 29.7018 23.7015 30.0003 23.3333 30.0003H8.66667C8.29848 30.0003 8 29.7018 8 29.3336V28.0003Z" fill="currentColor"/> <path fill-rule="evenodd" clip-rule="evenodd" d="M4.66602 6.66699C4.29783 6.66699 3.99935 6.96547 3.99935 7.33366V24.667C3.99935 25.0352 4.29783 25.3337 4.66602 25.3337H27.3327C27.7009 25.3337 27.9994 25.0352 27.9994 24.667V7.33366C27.9994 6.96547 27.7009 6.66699 27.3327 6.66699H4.66602ZM8.66659 21.3333C8.2984 21.3333 7.99992 21.0349 7.99992 20.6667V11.3333C7.99992 10.9651 8.2984 10.6667 8.66659 10.6667H13.9999C14.3681 10.6667 14.6666 10.9651 14.6666 11.3333V12.6667C14.6666 13.0349 14.3681 13.3333 13.9999 13.3333H10.7999C10.7263 13.3333 10.6666 13.393 10.6666 13.4667V18.5333C10.6666 18.607 10.7263 18.6667 10.7999 18.6667H13.9999C14.3681 18.6667 14.6666 18.9651 14.6666 19.3333V20.6667C14.6666 21.0349 14.3681 21.3333 13.9999 21.3333H8.66659ZM17.9999 21.3333C17.6317 21.3333 17.3333 21.0349 17.3333 20.6667V11.3333C17.3333 10.9651 17.6317 10.6667 17.9999 10.6667H23.3333C23.7014 10.6667 23.9999 10.9651 23.9999 11.3333V12.6667C23.9999 13.0349 23.7014 13.3333 23.3333 13.3333H20.1333C20.0596 13.3333 19.9999 13.393 19.9999 13.4667V18.5333C19.9999 18.607 20.0596 18.6667 20.1333 18.6667H23.3333C23.7014 18.6667 23.9999 18.9651 23.9999 19.3333V20.6667C23.9999 21.0349 23.7014 21.3333 23.3333 21.3333H17.9999Z" fill="currentColor"/>`;

var Icon$27 = `<path fill-rule="evenodd" clip-rule="evenodd" d="M4.6661 6.66699C4.29791 6.66699 3.99943 6.96547 3.99943 7.33366V24.667C3.99943 25.0352 4.29791 25.3337 4.6661 25.3337H27.3328C27.701 25.3337 27.9994 25.0352 27.9994 24.667V7.33366C27.9994 6.96547 27.701 6.66699 27.3328 6.66699H4.6661ZM8.66667 21.3333C8.29848 21.3333 8 21.0349 8 20.6667V11.3333C8 10.9651 8.29848 10.6667 8.66667 10.6667H14C14.3682 10.6667 14.6667 10.9651 14.6667 11.3333V12.6667C14.6667 13.0349 14.3682 13.3333 14 13.3333H10.8C10.7264 13.3333 10.6667 13.393 10.6667 13.4667V18.5333C10.6667 18.607 10.7264 18.6667 10.8 18.6667H14C14.3682 18.6667 14.6667 18.9651 14.6667 19.3333V20.6667C14.6667 21.0349 14.3682 21.3333 14 21.3333H8.66667ZM18 21.3333C17.6318 21.3333 17.3333 21.0349 17.3333 20.6667V11.3333C17.3333 10.9651 17.6318 10.6667 18 10.6667H23.3333C23.7015 10.6667 24 10.9651 24 11.3333V12.6667C24 13.0349 23.7015 13.3333 23.3333 13.3333H20.1333C20.0597 13.3333 20 13.393 20 13.4667V18.5333C20 18.607 20.0597 18.6667 20.1333 18.6667H23.3333C23.7015 18.6667 24 18.9651 24 19.3333V20.6667C24 21.0349 23.7015 21.3333 23.3333 21.3333H18Z" fill="currentColor"/>`;

var Icon$31 = `<path d="M14.2225 13.7867C14.3065 13.8706 14.4501 13.8112 14.4501 13.6924V5.99955C14.4501 5.63136 14.7486 5.33289 15.1167 5.33289H16.8501C17.2183 5.33289 17.5167 5.63136 17.5167 5.99955V13.6916C17.5167 13.8104 17.6604 13.8699 17.7444 13.7859L19.9433 11.5869C20.2037 11.3266 20.6258 11.3266 20.8861 11.5869L22.1118 12.8126C22.3722 13.0729 22.3722 13.4951 22.1118 13.7554L16.4549 19.4123C16.1946 19.6726 15.772 19.6731 15.5116 19.4128L9.85479 13.7559C9.59444 13.4956 9.59444 13.0734 9.85479 12.8131L11.0804 11.5874C11.3408 11.3271 11.7629 11.3271 12.0233 11.5874L14.2225 13.7867Z" fill="currentColor"/> <path d="M5.99998 20.267C5.63179 20.267 5.33331 20.5654 5.33331 20.9336V25.9997C5.33331 26.3678 5.63179 26.6663 5.99998 26.6663H26C26.3682 26.6663 26.6666 26.3678 26.6666 25.9997V20.9336C26.6666 20.5654 26.3682 20.267 26 20.267H24.2666C23.8985 20.267 23.6 20.5654 23.6 20.9336V22.9333C23.6 23.3014 23.3015 23.5999 22.9333 23.5999H9.06638C8.69819 23.5999 8.39972 23.3014 8.39972 22.9333V20.9336C8.39972 20.5654 8.10124 20.267 7.73305 20.267H5.99998Z" fill="currentColor"/>`;

var Icon$33 = `<path d="M16 20C18.2091 20 20 18.2092 20 16C20 13.7909 18.2091 12 16 12C13.7909 12 12 13.7909 12 16C12 18.2092 13.7909 20 16 20Z" fill="currentColor"/> <path fill-rule="evenodd" clip-rule="evenodd" d="M28 16.0058C28 18.671 23.5 25.3334 16 25.3334C8.5 25.3334 4 18.6762 4 16.0058C4 13.3354 8.50447 6.66669 16 6.66669C23.4955 6.66669 28 13.3406 28 16.0058ZM25.3318 15.9934C25.3328 16.0017 25.3328 16.0099 25.3318 16.0182C25.3274 16.0571 25.3108 16.1728 25.2485 16.3708C25.1691 16.6229 25.0352 16.9462 24.8327 17.3216C24.4264 18.0749 23.7969 18.9398 22.9567 19.754C21.2791 21.3798 18.9148 22.6667 16 22.6667C13.0845 22.6667 10.7202 21.3805 9.04298 19.7557C8.20295 18.9419 7.57362 18.0773 7.16745 17.3241C6.96499 16.9486 6.83114 16.6252 6.75172 16.3729C6.67942 16.1431 6.66856 16.0243 6.66695 16.0066L6.66695 16.005C6.66859 15.9871 6.67951 15.8682 6.75188 15.6383C6.83145 15.3854 6.96554 15.0614 7.16831 14.6853C7.57507 13.9306 8.20514 13.0644 9.04577 12.249C10.7245 10.6208 13.0886 9.33335 16 9.33335C18.9108 9.33335 21.2748 10.6215 22.9539 12.2507C23.7947 13.0664 24.4249 13.933 24.8318 14.6877C25.0346 15.0639 25.1688 15.3878 25.2483 15.6404C25.3107 15.8386 25.3274 15.9545 25.3318 15.9934Z" fill="currentColor"/>`;

var Icon$34 = `<path d="M15.8747 8.11857C16.3148 7.79342 16.9375 8.10759 16.9375 8.65476V14.2575C16.9375 14.3669 17.0621 14.4297 17.1501 14.3647L25.6038 8.11857C26.0439 7.79342 26.6667 8.10759 26.6667 8.65476V23.3451C26.6667 23.8923 26.0439 24.2064 25.6038 23.8813L17.1501 17.6346C17.0621 17.5695 16.9375 17.6324 16.9375 17.7418L16.9375 23.3451C16.9375 23.8923 16.3147 24.2064 15.8747 23.8813L5.93387 16.5358C5.57322 16.2693 5.57323 15.7299 5.93389 15.4634L15.8747 8.11857Z" fill="currentColor"/>`;

var Icon$35 = `<path d="M16.1253 8.11866C15.6852 7.7935 15.0625 8.10768 15.0625 8.65484V14.2576C15.0625 14.367 14.9379 14.4298 14.8499 14.3648L6.39615 8.11866C5.95607 7.7935 5.33331 8.10768 5.33331 8.65484V23.3452C5.33331 23.8923 5.9561 24.2065 6.39617 23.8813L14.8499 17.6347C14.9379 17.5696 15.0625 17.6325 15.0625 17.7419L15.0625 23.3452C15.0625 23.8923 15.6853 24.2065 16.1253 23.8813L26.0661 16.5358C26.4268 16.2694 26.4268 15.73 26.0661 15.4635L16.1253 8.11866Z" fill="currentColor"/>`;

var Icon$39 = `<path d="M19.3334 13.3333C18.9652 13.3333 18.6667 13.0349 18.6667 12.6667L18.6667 7.33333C18.6667 6.96514 18.9652 6.66666 19.3334 6.66666H21.3334C21.7015 6.66666 22 6.96514 22 7.33333V9.86666C22 9.9403 22.0597 10 22.1334 10L24.6667 10C25.0349 10 25.3334 10.2985 25.3334 10.6667V12.6667C25.3334 13.0349 25.0349 13.3333 24.6667 13.3333L19.3334 13.3333Z" fill="currentColor"/> <path d="M13.3334 19.3333C13.3334 18.9651 13.0349 18.6667 12.6667 18.6667H7.33335C6.96516 18.6667 6.66669 18.9651 6.66669 19.3333V21.3333C6.66669 21.7015 6.96516 22 7.33335 22H9.86669C9.94032 22 10 22.0597 10 22.1333L10 24.6667C10 25.0349 10.2985 25.3333 10.6667 25.3333H12.6667C13.0349 25.3333 13.3334 25.0349 13.3334 24.6667L13.3334 19.3333Z" fill="currentColor"/> <path d="M18.6667 24.6667C18.6667 25.0349 18.9652 25.3333 19.3334 25.3333H21.3334C21.7015 25.3333 22 25.0349 22 24.6667V22.1333C22 22.0597 22.0597 22 22.1334 22H24.6667C25.0349 22 25.3334 21.7015 25.3334 21.3333V19.3333C25.3334 18.9651 25.0349 18.6667 24.6667 18.6667L19.3334 18.6667C18.9652 18.6667 18.6667 18.9651 18.6667 19.3333L18.6667 24.6667Z" fill="currentColor"/> <path d="M10.6667 13.3333H12.6667C13.0349 13.3333 13.3334 13.0349 13.3334 12.6667L13.3334 10.6667V7.33333C13.3334 6.96514 13.0349 6.66666 12.6667 6.66666H10.6667C10.2985 6.66666 10 6.96514 10 7.33333L10 9.86666C10 9.9403 9.94033 10 9.86669 10L7.33335 10C6.96516 10 6.66669 10.2985 6.66669 10.6667V12.6667C6.66669 13.0349 6.96516 13.3333 7.33335 13.3333L10.6667 13.3333Z" fill="currentColor"/>`;

var Icon$40 = `<path d="M25.3299 7.26517C25.2958 6.929 25.0119 6.66666 24.6667 6.66666H19.3334C18.9652 6.66666 18.6667 6.96514 18.6667 7.33333V9.33333C18.6667 9.70152 18.9652 10 19.3334 10L21.8667 10C21.9403 10 22 10.0597 22 10.1333V12.6667C22 13.0349 22.2985 13.3333 22.6667 13.3333H24.6667C25.0349 13.3333 25.3334 13.0349 25.3334 12.6667V7.33333C25.3334 7.31032 25.3322 7.28758 25.3299 7.26517Z" fill="currentColor"/> <path d="M22 21.8667C22 21.9403 21.9403 22 21.8667 22L19.3334 22C18.9652 22 18.6667 22.2985 18.6667 22.6667V24.6667C18.6667 25.0349 18.9652 25.3333 19.3334 25.3333L24.6667 25.3333C25.0349 25.3333 25.3334 25.0349 25.3334 24.6667V19.3333C25.3334 18.9651 25.0349 18.6667 24.6667 18.6667H22.6667C22.2985 18.6667 22 18.9651 22 19.3333V21.8667Z" fill="currentColor"/> <path d="M12.6667 22H10.1334C10.0597 22 10 21.9403 10 21.8667V19.3333C10 18.9651 9.70154 18.6667 9.33335 18.6667H7.33335C6.96516 18.6667 6.66669 18.9651 6.66669 19.3333V24.6667C6.66669 25.0349 6.96516 25.3333 7.33335 25.3333H12.6667C13.0349 25.3333 13.3334 25.0349 13.3334 24.6667V22.6667C13.3334 22.2985 13.0349 22 12.6667 22Z" fill="currentColor"/> <path d="M10 12.6667V10.1333C10 10.0597 10.0597 10 10.1334 10L12.6667 10C13.0349 10 13.3334 9.70152 13.3334 9.33333V7.33333C13.3334 6.96514 13.0349 6.66666 12.6667 6.66666H7.33335C6.96516 6.66666 6.66669 6.96514 6.66669 7.33333V12.6667C6.66669 13.0349 6.96516 13.3333 7.33335 13.3333H9.33335C9.70154 13.3333 10 13.0349 10 12.6667Z" fill="currentColor"/>`;

var Icon$53 = `<path fill-rule="evenodd" clip-rule="evenodd" d="M26.6667 5.99998C26.6667 5.63179 26.3682 5.33331 26 5.33331H11.3333C10.9651 5.33331 10.6667 5.63179 10.6667 5.99998V17.5714C10.6667 17.6694 10.5644 17.7342 10.4741 17.6962C9.91823 17.4625 9.30754 17.3333 8.66667 17.3333C6.08934 17.3333 4 19.4226 4 22C4 24.5773 6.08934 26.6666 8.66667 26.6666C11.244 26.6666 13.3333 24.5773 13.3333 22V8.66665C13.3333 8.29846 13.6318 7.99998 14 7.99998L23.3333 7.99998C23.7015 7.99998 24 8.29846 24 8.66665V14.9048C24 15.0027 23.8978 15.0675 23.8075 15.0296C23.2516 14.7958 22.6409 14.6666 22 14.6666C19.4227 14.6666 17.3333 16.756 17.3333 19.3333C17.3333 21.9106 19.4227 24 22 24C24.5773 24 26.6667 21.9106 26.6667 19.3333V5.99998ZM22 21.3333C23.1046 21.3333 24 20.4379 24 19.3333C24 18.2287 23.1046 17.3333 22 17.3333C20.8954 17.3333 20 18.2287 20 19.3333C20 20.4379 20.8954 21.3333 22 21.3333ZM8.66667 24C9.77124 24 10.6667 23.1045 10.6667 22C10.6667 20.8954 9.77124 20 8.66667 20C7.5621 20 6.66667 20.8954 6.66667 22C6.66667 23.1045 7.5621 24 8.66667 24Z" fill="currentColor"/>`;

var Icon$54 = `<path d="M17.5091 24.6594C17.5091 25.2066 16.8864 25.5208 16.4463 25.1956L9.44847 20.0252C9.42553 20.0083 9.39776 19.9991 9.36923 19.9991H4.66667C4.29848 19.9991 4 19.7006 4 19.3325V12.6658C4 12.2976 4.29848 11.9991 4.66667 11.9991H9.37115C9.39967 11.9991 9.42745 11.99 9.45039 11.973L16.4463 6.8036C16.8863 6.47842 17.5091 6.79259 17.5091 7.33977L17.5091 24.6594Z" fill="currentColor"/> <path d="M28.8621 13.6422C29.1225 13.3818 29.1225 12.9597 28.8621 12.6994L27.9193 11.7566C27.659 11.4962 27.2368 11.4962 26.9765 11.7566L24.7134 14.0197C24.6613 14.0717 24.5769 14.0717 24.5248 14.0197L22.262 11.7568C22.0016 11.4964 21.5795 11.4964 21.3191 11.7568L20.3763 12.6996C20.116 12.9599 20.116 13.382 20.3763 13.6424L22.6392 15.9053C22.6913 15.9573 22.6913 16.0418 22.6392 16.0938L20.3768 18.3562C20.1165 18.6166 20.1165 19.0387 20.3768 19.299L21.3196 20.2419C21.58 20.5022 22.0021 20.5022 22.2624 20.2418L24.5248 17.9795C24.5769 17.9274 24.6613 17.9274 24.7134 17.9795L26.976 20.2421C27.2363 20.5024 27.6585 20.5024 27.9188 20.2421L28.8616 19.2992C29.122 19.0389 29.122 18.6168 28.8616 18.3564L26.599 16.0938C26.547 16.0418 26.547 15.9573 26.599 15.9053L28.8621 13.6422Z" fill="currentColor"/>`;

var Icon$56 = `<path d="M26.6009 16.0725C26.6009 16.424 26.4302 17.1125 25.9409 18.0213C25.4676 18.8976 24.7542 19.8715 23.8182 20.7783C21.9489 22.5905 19.2662 24.0667 15.9342 24.0667C12.6009 24.0667 9.91958 22.5915 8.04891 20.78C7.11424 19.8736 6.40091 18.9 5.92758 18.0236C5.43824 17.1149 5.26758 16.4257 5.26758 16.0725C5.26758 15.7193 5.43824 15.0293 5.92891 14.1193C6.40224 13.2416 7.11558 12.2665 8.05158 11.3587C9.92224 9.54398 12.6049 8.06665 15.9342 8.06665C19.2636 8.06665 21.9449 9.54505 23.8169 11.3604C24.7529 12.2687 25.4662 13.2441 25.9396 14.1216C26.4302 15.0317 26.6009 15.7209 26.6009 16.0725Z" stroke="currentColor" stroke-width="3"/> <path d="M15.9336 20.0667C18.1427 20.0667 19.9336 18.2758 19.9336 16.0667C19.9336 13.8575 18.1427 12.0667 15.9336 12.0667C13.7245 12.0667 11.9336 13.8575 11.9336 16.0667C11.9336 18.2758 13.7245 20.0667 15.9336 20.0667Z" fill="currentColor"/> <path fill-rule="evenodd" clip-rule="evenodd" d="M27.2323 25.0624L6.93878 4.76886C6.78118 4.61126 6.70762 4.57052 6.61919 4.54372C6.53077 4.51692 6.44033 4.51691 6.3519 4.54372C6.26347 4.57052 6.18991 4.61126 6.03231 4.76886L4.77032 6.03085C4.61272 6.18845 4.57198 6.26201 4.54518 6.35044C4.51838 6.43887 4.51838 6.5293 4.54518 6.61773C4.57198 6.70616 4.61272 6.77972 4.77032 6.93732L25.0639 27.2308C25.2215 27.3884 25.295 27.4292 25.3834 27.456C25.4719 27.4828 25.5623 27.4828 25.6507 27.456C25.7392 27.4292 25.8127 27.3885 25.9703 27.2309L27.2323 25.9689C27.3899 25.8113 27.4307 25.7377 27.4575 25.6493C27.4843 25.5608 27.4843 25.4704 27.4575 25.382C27.4307 25.2935 27.3899 25.22 27.2323 25.0624Z" fill="currentColor"/>`;

var Icon$59 = `<path d="M8.66667 6.66667C8.29848 6.66667 8 6.96514 8 7.33333V24.6667C8 25.0349 8.29848 25.3333 8.66667 25.3333H12.6667C13.0349 25.3333 13.3333 25.0349 13.3333 24.6667V7.33333C13.3333 6.96514 13.0349 6.66667 12.6667 6.66667H8.66667Z" fill="currentColor"/> <path d="M19.3333 6.66667C18.9651 6.66667 18.6667 6.96514 18.6667 7.33333V24.6667C18.6667 25.0349 18.9651 25.3333 19.3333 25.3333H23.3333C23.7015 25.3333 24 25.0349 24 24.6667V7.33333C24 6.96514 23.7015 6.66667 23.3333 6.66667H19.3333Z" fill="currentColor"/>`;

var Icon$60 = `<path d="M5.33334 26V19.4667C5.33334 19.393 5.39304 19.3333 5.46668 19.3333H7.86668C7.94031 19.3333 8.00001 19.393 8.00001 19.4667V23.3333C8.00001 23.7015 8.29849 24 8.66668 24H23.3333C23.7015 24 24 23.7015 24 23.3333V8.66666C24 8.29847 23.7015 7.99999 23.3333 7.99999H19.4667C19.393 7.99999 19.3333 7.9403 19.3333 7.86666V5.46666C19.3333 5.39302 19.393 5.33333 19.4667 5.33333H26C26.3682 5.33333 26.6667 5.63181 26.6667 5.99999V26C26.6667 26.3682 26.3682 26.6667 26 26.6667H6.00001C5.63182 26.6667 5.33334 26.3682 5.33334 26Z" fill="currentColor"/> <path d="M14.0098 8.42359H10.806C10.6872 8.42359 10.6277 8.56721 10.7117 8.6512L16.5491 14.4886C16.8094 14.7489 16.8094 15.171 16.5491 15.4314L15.3234 16.657C15.0631 16.9174 14.641 16.9174 14.3806 16.657L8.63739 10.9138C8.55339 10.8298 8.40978 10.8893 8.40978 11.0081V14.0236C8.40978 14.3918 8.1113 14.6903 7.74311 14.6903H6.00978C5.64159 14.6903 5.34311 14.3918 5.34311 14.0236L5.34311 6.02359C5.34311 5.6554 5.64159 5.35692 6.00978 5.35692L14.0098 5.35692C14.378 5.35692 14.6764 5.6554 14.6764 6.02359V7.75692C14.6764 8.12511 14.378 8.42359 14.0098 8.42359Z" fill="currentColor"/>`;

var Icon$61 = `<path d="M16 15.3333C15.6318 15.3333 15.3333 15.6318 15.3333 16V20C15.3333 20.3682 15.6318 20.6667 16 20.6667H21.3333C21.7015 20.6667 22 20.3682 22 20V16C22 15.6318 21.7015 15.3333 21.3333 15.3333H16Z" fill="currentColor"/> <path fill-rule="evenodd" clip-rule="evenodd" d="M5.33333 7.33334C5.33333 6.96515 5.63181 6.66667 5.99999 6.66667H26C26.3682 6.66667 26.6667 6.96515 26.6667 7.33334V24.6667C26.6667 25.0349 26.3682 25.3333 26 25.3333H5.99999C5.63181 25.3333 5.33333 25.0349 5.33333 24.6667V7.33334ZM7.99999 10C7.99999 9.63182 8.29847 9.33334 8.66666 9.33334H23.3333C23.7015 9.33334 24 9.63182 24 10V22C24 22.3682 23.7015 22.6667 23.3333 22.6667H8.66666C8.29847 22.6667 7.99999 22.3682 7.99999 22V10Z" fill="currentColor"/>`;

var Icon$62 = `<path d="M10.6667 6.6548C10.6667 6.10764 11.2894 5.79346 11.7295 6.11862L24.377 15.4634C24.7377 15.7298 24.7377 16.2692 24.3771 16.5357L11.7295 25.8813C11.2895 26.2065 10.6667 25.8923 10.6667 25.3451L10.6667 6.6548Z" fill="currentColor"/>`;

var Icon$63 = `<path d="M13.9213 5.53573C14.3146 5.45804 14.6666 5.76987 14.6666 6.17079V7.57215C14.6666 7.89777 14.4305 8.17277 14.114 8.24925C12.5981 8.61559 11.2506 9.41368 10.2091 10.506C9.98474 10.7414 9.62903 10.8079 9.34742 10.6453L8.14112 9.94885C7.79394 9.7484 7.69985 9.28777 7.96359 8.98585C9.48505 7.24409 11.5636 6.00143 13.9213 5.53573Z" fill="currentColor"/> <path d="M5.88974 12.5908C6.01805 12.2101 6.46491 12.0603 6.81279 12.2611L8.01201 12.9535C8.29379 13.1162 8.41396 13.4577 8.32238 13.7699C8.11252 14.4854 7.99998 15.2424 7.99998 16.0257C7.99998 16.809 8.11252 17.566 8.32238 18.2814C8.41396 18.5936 8.29378 18.9352 8.01201 19.0979L6.82742 19.7818C6.48051 19.9821 6.03488 19.8337 5.90521 19.4547C5.5345 18.3712 5.33331 17.2091 5.33331 16C5.33331 14.8078 5.5289 13.6613 5.88974 12.5908Z" fill="currentColor"/> <path d="M8.17106 22.0852C7.82291 22.2862 7.72949 22.7486 7.99532 23.0502C9.51387 24.773 11.5799 26.0017 13.9213 26.4642C14.3146 26.5419 14.6666 26.2301 14.6666 25.8291V24.4792C14.6666 24.1536 14.4305 23.8786 14.114 23.8021C12.5981 23.4358 11.2506 22.6377 10.2091 21.5453C9.98474 21.31 9.62903 21.2435 9.34742 21.4061L8.17106 22.0852Z" fill="currentColor"/> <path d="M17.3333 25.8291C17.3333 26.2301 17.6857 26.5418 18.079 26.4641C22.9748 25.4969 26.6666 21.1796 26.6666 16C26.6666 10.8204 22.9748 6.50302 18.079 5.5358C17.6857 5.4581 17.3333 5.76987 17.3333 6.17079V7.57215C17.3333 7.89777 17.5697 8.17282 17.8862 8.24932C21.3942 9.09721 24 12.2572 24 16.0257C24 19.7942 21.3942 22.9542 17.8862 23.802C17.5697 23.8785 17.3333 24.1536 17.3333 24.4792V25.8291Z" fill="currentColor"/> <path d="M14.3961 10.4163C13.9561 10.0911 13.3333 10.4053 13.3333 10.9525L13.3333 21.0474C13.3333 21.5946 13.9561 21.9087 14.3962 21.5836L21.2273 16.5359C21.5879 16.2694 21.5879 15.73 21.2273 15.4635L14.3961 10.4163Z" fill="currentColor"/>`;

var Icon$74 = `<path d="M15.6038 12.2147C16.0439 12.5399 16.6667 12.2257 16.6667 11.6786V10.1789C16.6667 10.1001 16.7351 10.0384 16.8134 10.0479C20.1116 10.4494 22.6667 13.2593 22.6667 16.6659C22.6667 20.3481 19.6817 23.3332 15.9995 23.3332C12.542 23.3332 9.69927 20.7014 9.36509 17.332C9.32875 16.9655 9.03371 16.6662 8.66548 16.6662L6.66655 16.6666C6.29841 16.6666 5.99769 16.966 6.02187 17.3334C6.36494 22.5454 10.7012 26.6667 16 26.6667C21.5228 26.6667 26 22.1895 26 16.6667C26 11.4103 21.9444 7.10112 16.7916 6.69757C16.7216 6.69209 16.6667 6.63396 16.6667 6.56372V4.98824C16.6667 4.44106 16.0439 4.12689 15.6038 4.45206L11.0765 7.79738C10.7159 8.06387 10.7159 8.60326 11.0766 8.86973L15.6038 12.2147Z" fill="currentColor"/>`;

var Icon$77 = `<path d="M16.6667 10.3452C16.6667 10.8924 16.0439 11.2066 15.6038 10.8814L11.0766 7.5364C10.7159 7.26993 10.7159 6.73054 11.0766 6.46405L15.6038 3.11873C16.0439 2.79356 16.6667 3.10773 16.6667 3.6549V5.22682C16.6667 5.29746 16.7223 5.35579 16.7927 5.36066C22.6821 5.76757 27.3333 10.674 27.3333 16.6667C27.3333 22.9259 22.2592 28 16 28C9.96483 28 5.03145 23.2827 4.68601 17.3341C4.66466 16.9665 4.96518 16.6673 5.33339 16.6673H7.3334C7.70157 16.6673 7.99714 16.9668 8.02743 17.3337C8.36638 21.4399 11.8064 24.6667 16 24.6667C20.4183 24.6667 24 21.085 24 16.6667C24 12.5225 20.8483 9.11428 16.8113 8.70739C16.7337 8.69957 16.6667 8.76096 16.6667 8.83893V10.3452Z" fill="currentColor"/> <path fill-rule="evenodd" clip-rule="evenodd" d="M17.0879 19.679C17.4553 19.9195 17.8928 20.0398 18.4004 20.0398C18.9099 20.0398 19.3474 19.9205 19.7129 19.6818C20.0803 19.4413 20.3635 19.0938 20.5623 18.6392C20.7612 18.1847 20.8606 17.6373 20.8606 16.9972C20.8625 16.3608 20.764 15.8192 20.5652 15.3722C20.3663 14.9252 20.0822 14.5853 19.7129 14.3523C19.3455 14.1175 18.908 14 18.4004 14C17.8928 14 17.4553 14.1175 17.0879 14.3523C16.7224 14.5853 16.4402 14.9252 16.2413 15.3722C16.0443 15.8173 15.9449 16.3589 15.943 16.9972C15.9411 17.6354 16.0396 18.1818 16.2385 18.6364C16.4373 19.089 16.7205 19.4366 17.0879 19.679ZM19.1362 18.4262C18.9487 18.7349 18.7034 18.8892 18.4004 18.8892C18.1996 18.8892 18.0226 18.8211 17.8691 18.6847C17.7157 18.5464 17.5964 18.3372 17.5112 18.0568C17.4279 17.7765 17.3871 17.4233 17.389 16.9972C17.3909 16.3684 17.4847 15.9025 17.6703 15.5995C17.8559 15.2945 18.0993 15.1421 18.4004 15.1421C18.603 15.1421 18.7801 15.2093 18.9316 15.3438C19.0832 15.4782 19.2015 15.6828 19.2868 15.9574C19.372 16.2301 19.4146 16.5767 19.4146 16.9972C19.4165 17.6392 19.3237 18.1156 19.1362 18.4262Z" fill="currentColor"/> <path d="M13.7746 19.8978C13.8482 19.8978 13.9079 19.8381 13.9079 19.7644V14.2129C13.9079 14.1393 13.8482 14.0796 13.7746 14.0796H12.642C12.6171 14.0796 12.5927 14.0865 12.5716 14.0997L11.2322 14.9325C11.1931 14.9568 11.1693 14.9996 11.1693 15.0457V15.9497C11.1693 16.0539 11.2833 16.1178 11.3722 16.0635L12.464 15.396C12.4682 15.3934 12.473 15.3921 12.4779 15.3921C12.4926 15.3921 12.5045 15.404 12.5045 15.4187V19.7644C12.5045 19.8381 12.5642 19.8978 12.6378 19.8978H13.7746Z" fill="currentColor"/>`;

var Icon$81 = `<path d="M15.3333 10.3452C15.3333 10.8924 15.9561 11.2066 16.3962 10.8814L20.9234 7.5364C21.2841 7.26993 21.2841 6.73054 20.9235 6.46405L16.3962 3.11873C15.9561 2.79356 15.3333 3.10773 15.3333 3.6549V5.22682C15.3333 5.29746 15.2778 5.35579 15.2073 5.36066C9.31791 5.76757 4.66667 10.674 4.66667 16.6667C4.66667 22.9259 9.74078 28 16 28C22.0352 28 26.9686 23.2827 27.314 17.3341C27.3354 16.9665 27.0348 16.6673 26.6666 16.6673H24.6666C24.2984 16.6673 24.0029 16.9668 23.9726 17.3337C23.6336 21.4399 20.1937 24.6667 16 24.6667C11.5817 24.6667 8 21.085 8 16.6667C8 12.5225 11.1517 9.11428 15.1887 8.70739C15.2663 8.69957 15.3333 8.76096 15.3333 8.83893V10.3452Z" fill="currentColor"/> <path fill-rule="evenodd" clip-rule="evenodd" d="M17.0879 19.679C17.4553 19.9195 17.8928 20.0398 18.4004 20.0398C18.9099 20.0398 19.3474 19.9205 19.7129 19.6818C20.0803 19.4413 20.3635 19.0938 20.5623 18.6392C20.7612 18.1847 20.8606 17.6373 20.8606 16.9972C20.8625 16.3608 20.764 15.8192 20.5652 15.3722C20.3663 14.9252 20.0822 14.5853 19.7129 14.3523C19.3455 14.1175 18.908 14 18.4004 14C17.8928 14 17.4553 14.1175 17.0879 14.3523C16.7224 14.5853 16.4402 14.9252 16.2413 15.3722C16.0443 15.8173 15.9449 16.3589 15.943 16.9972C15.9411 17.6354 16.0396 18.1818 16.2385 18.6364C16.4373 19.089 16.7205 19.4366 17.0879 19.679ZM19.1362 18.4262C18.9487 18.7349 18.7034 18.8892 18.4004 18.8892C18.1996 18.8892 18.0225 18.8211 17.8691 18.6847C17.7157 18.5464 17.5964 18.3372 17.5112 18.0568C17.4278 17.7765 17.3871 17.4233 17.389 16.9972C17.3909 16.3684 17.4847 15.9025 17.6703 15.5995C17.8559 15.2945 18.0992 15.1421 18.4004 15.1421C18.603 15.1421 18.7801 15.2093 18.9316 15.3438C19.0831 15.4782 19.2015 15.6828 19.2867 15.9574C19.372 16.2301 19.4146 16.5767 19.4146 16.9972C19.4165 17.6392 19.3237 18.1156 19.1362 18.4262Z" fill="currentColor"/> <path d="M13.7746 19.8978C13.8482 19.8978 13.9079 19.8381 13.9079 19.7644V14.2129C13.9079 14.1393 13.8482 14.0796 13.7746 14.0796H12.642C12.6171 14.0796 12.5927 14.0865 12.5716 14.0997L11.2322 14.9325C11.1931 14.9568 11.1693 14.9996 11.1693 15.0457V15.9497C11.1693 16.0539 11.2833 16.1178 11.3722 16.0635L12.464 15.396C12.4682 15.3934 12.473 15.3921 12.4779 15.3921C12.4926 15.3921 12.5045 15.404 12.5045 15.4187V19.7644C12.5045 19.8381 12.5642 19.8978 12.6378 19.8978H13.7746Z" fill="currentColor"/>`;

var Icon$88 = `<path fill-rule="evenodd" clip-rule="evenodd" d="M13.5722 5.33333C13.2429 5.33333 12.9629 5.57382 12.9132 5.89938L12.4063 9.21916C12.4 9.26058 12.3746 9.29655 12.3378 9.31672C12.2387 9.37118 12.1409 9.42779 12.0444 9.48648C12.0086 9.5083 11.9646 9.51242 11.9255 9.49718L8.79572 8.27692C8.48896 8.15732 8.14083 8.27958 7.9762 8.56472L5.5491 12.7686C5.38444 13.0538 5.45271 13.4165 5.70981 13.6223L8.33308 15.7225C8.3658 15.7487 8.38422 15.7887 8.38331 15.8306C8.38209 15.8867 8.38148 15.9429 8.38148 15.9993C8.38148 16.0558 8.3821 16.1121 8.38332 16.1684C8.38423 16.2102 8.36582 16.2503 8.33313 16.2765L5.7103 18.3778C5.45334 18.5836 5.38515 18.9462 5.54978 19.2314L7.97688 23.4352C8.14155 23.7205 8.48981 23.8427 8.79661 23.723L11.926 22.5016C11.9651 22.4864 12.009 22.4905 12.0449 22.5123C12.1412 22.5709 12.2388 22.6274 12.3378 22.6818C12.3745 22.7019 12.4 22.7379 12.4063 22.7793L12.9132 26.0993C12.9629 26.4249 13.2429 26.6654 13.5722 26.6654H18.4264C18.7556 26.6654 19.0356 26.425 19.0854 26.0995L19.5933 22.7801C19.5997 22.7386 19.6252 22.7027 19.6619 22.6825C19.7614 22.6279 19.8596 22.5711 19.9564 22.5121C19.9923 22.4903 20.0362 22.4862 20.0754 22.5015L23.2035 23.7223C23.5103 23.842 23.8585 23.7198 24.0232 23.4346L26.4503 19.2307C26.6149 18.9456 26.5467 18.583 26.2898 18.3771L23.6679 16.2766C23.6352 16.2504 23.6168 16.2104 23.6177 16.1685C23.619 16.1122 23.6196 16.0558 23.6196 15.9993C23.6196 15.9429 23.619 15.8866 23.6177 15.8305C23.6168 15.7886 23.6353 15.7486 23.668 15.7224L26.2903 13.623C26.5474 13.4172 26.6156 13.0544 26.451 12.7692L24.0239 8.56537C23.8592 8.28023 23.5111 8.15797 23.2043 8.27757L20.0758 9.49734C20.0367 9.51258 19.9927 9.50846 19.9569 9.48664C19.8599 9.42762 19.7616 9.37071 19.6618 9.31596C19.6251 9.2958 19.5997 9.25984 19.5933 9.21843L19.0854 5.89915C19.0356 5.57369 18.7556 5.33333 18.4264 5.33333H13.5722ZM16.0001 20.2854C18.3672 20.2854 20.2862 18.3664 20.2862 15.9993C20.2862 13.6322 18.3672 11.7132 16.0001 11.7132C13.6329 11.7132 11.714 13.6322 11.714 15.9993C11.714 18.3664 13.6329 20.2854 16.0001 20.2854Z" fill="currentColor"/>`;

var Icon$104 = `<path d="M17.5091 24.6595C17.5091 25.2066 16.8864 25.5208 16.4463 25.1956L9.44847 20.0252C9.42553 20.0083 9.39776 19.9992 9.36923 19.9992H4.66667C4.29848 19.9992 4 19.7007 4 19.3325V12.6658C4 12.2976 4.29848 11.9992 4.66667 11.9992H9.37115C9.39967 11.9992 9.42745 11.99 9.45039 11.9731L16.4463 6.80363C16.8863 6.47845 17.5091 6.79262 17.5091 7.3398L17.5091 24.6595Z" fill="currentColor"/> <path d="M27.5091 9.33336C27.8773 9.33336 28.1758 9.63184 28.1758 10V22C28.1758 22.3682 27.8773 22.6667 27.5091 22.6667H26.1758C25.8076 22.6667 25.5091 22.3682 25.5091 22V10C25.5091 9.63184 25.8076 9.33336 26.1758 9.33336L27.5091 9.33336Z" fill="currentColor"/> <path d="M22.1758 12C22.544 12 22.8424 12.2985 22.8424 12.6667V19.3334C22.8424 19.7016 22.544 20 22.1758 20H20.8424C20.4743 20 20.1758 19.7016 20.1758 19.3334V12.6667C20.1758 12.2985 20.4743 12 20.8424 12H22.1758Z" fill="currentColor"/>`;

var Icon$105 = `<path d="M17.5091 24.6594C17.5091 25.2066 16.8864 25.5207 16.4463 25.1956L9.44847 20.0252C9.42553 20.0083 9.39776 19.9991 9.36923 19.9991H4.66667C4.29848 19.9991 4 19.7006 4 19.3324V12.6658C4 12.2976 4.29848 11.9991 4.66667 11.9991H9.37115C9.39967 11.9991 9.42745 11.99 9.45039 11.973L16.4463 6.80358C16.8863 6.4784 17.5091 6.79258 17.5091 7.33975L17.5091 24.6594Z" fill="currentColor"/> <path d="M22.8424 12.6667C22.8424 12.2985 22.544 12 22.1758 12H20.8424C20.4743 12 20.1758 12.2985 20.1758 12.6667V19.3333C20.1758 19.7015 20.4743 20 20.8424 20H22.1758C22.544 20 22.8424 19.7015 22.8424 19.3333V12.6667Z" fill="currentColor"/>`;

const icons$2 = {
  airplay: Icon$5,
  download: Icon$31,
  play: Icon$62,
  pause: Icon$59,
  replay: Icon$74,
  mute: Icon$54,
  "google-cast": Icon$24,
  "volume-low": Icon$105,
  "volume-high": Icon$104,
  "cc-on": Icon$26,
  "cc-off": Icon$27,
  "pip-enter": Icon$61,
  "pip-exit": Icon$60,
  "fs-enter": Icon$40,
  "fs-exit": Icon$39,
  "seek-forward": Icon$81,
  "seek-backward": Icon$77,
  "menu-chapters": Icon$16,
  "menu-settings": Icon$88,
  "menu-arrow-left": Icon$11,
  "menu-arrow-right": Icon$22,
  "menu-accessibility": Icon$0,
  "menu-audio": Icon$53,
  "menu-audio-boost-up": Icon$104,
  "menu-audio-boost-down": Icon$105,
  "menu-playback": Icon$63,
  "menu-speed-up": Icon$35,
  "menu-speed-down": Icon$34,
  "menu-captions": Icon$27,
  "menu-quality-up": Icon$13,
  "menu-quality-down": Icon$8,
  "menu-radio-check": Icon$19,
  "menu-font-size-up": Icon$13,
  "menu-font-size-down": Icon$8,
  "menu-opacity-up": Icon$33,
  "menu-opacity-down": Icon$56,
  "kb-play": Icon$62,
  "kb-pause": Icon$59,
  "kb-mute": Icon$54,
  "kb-volume-up": Icon$104,
  "kb-volume-down": Icon$105,
  "kb-fs-enter": Icon$40,
  "kb-fs-exit": Icon$39,
  "kb-pip-enter": Icon$61,
  "kb-pip-exit": Icon$60,
  "kb-cc-on": Icon$26,
  "kb-cc-off": Icon$27,
  "kb-seek-forward": Icon$35,
  "kb-seek-backward": Icon$34
};

var icons$3 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  icons: icons$2
});

const plyrLayoutContext = createContext();
function usePlyrLayoutContext() {
  return useContext(plyrLayoutContext);
}

const plyrLayoutProps = {
  clickToPlay: true,
  clickToFullscreen: true,
  controls: [
    "play-large",
    "play",
    "progress",
    "current-time",
    "mute+volume",
    "captions",
    "settings",
    "pip",
    "airplay",
    "fullscreen"
  ],
  customIcons: false,
  displayDuration: false,
  download: null,
  markers: null,
  invertTime: true,
  thumbnails: null,
  toggleTime: true,
  translations: null,
  seekTime: 10,
  speed: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 4]
};

class PlyrLayout extends Component {
  static props = plyrLayoutProps;
  #media;
  onSetup() {
    this.#media = useMediaContext();
    provideContext(plyrLayoutContext, {
      ...this.$props,
      previewTime: signal(0)
    });
  }
}
function usePlyrLayoutClasses(el, media) {
  const {
    canAirPlay,
    canFullscreen,
    canPictureInPicture,
    controlsHidden,
    currentTime,
    fullscreen,
    hasCaptions,
    isAirPlayConnected,
    paused,
    pictureInPicture,
    playing,
    pointer,
    poster,
    textTrack,
    viewType,
    waiting
  } = media.$state;
  el.classList.add("plyr");
  el.classList.add("plyr--full-ui");
  const classes = {
    "plyr--airplay-active": isAirPlayConnected,
    "plyr--airplay-supported": canAirPlay,
    "plyr--fullscreen-active": fullscreen,
    "plyr--fullscreen-enabled": canFullscreen,
    "plyr--hide-controls": controlsHidden,
    "plyr--is-touch": () => pointer() === "coarse",
    "plyr--loading": waiting,
    "plyr--paused": paused,
    "plyr--pip-active": pictureInPicture,
    "plyr--pip-enabled": canPictureInPicture,
    "plyr--playing": playing,
    "plyr__poster-enabled": poster,
    "plyr--stopped": () => paused() && currentTime() === 0,
    "plyr--captions-active": textTrack,
    "plyr--captions-enabled": hasCaptions
  };
  const disposal = createDisposalBin();
  for (const token of Object.keys(classes)) {
    disposal.add(effect(() => void el.classList.toggle(token, !!classes[token]())));
  }
  disposal.add(
    effect(() => {
      const token = `plyr--${viewType()}`;
      el.classList.add(token);
      return () => el.classList.remove(token);
    }),
    effect(() => {
      const { $provider } = media, type = $provider()?.type, token = `plyr--${isHTMLProvider(type) ? "html5" : type}`;
      el.classList.toggle(token, !!type);
      return () => el.classList.remove(token);
    })
  );
  return () => disposal.empty();
}
function isHTMLProvider(type) {
  return type === "audio" || type === "video";
}

class PlyrLayoutIconsLoader extends LayoutIconsLoader {
  async loadIcons() {
    const paths = (await Promise.resolve().then(function () { return icons$1; })).icons, icons = {};
    for (const iconName of Object.keys(paths)) {
      icons[iconName] = Icon({
        name: iconName,
        paths: paths[iconName],
        viewBox: "0 0 18 18"
      });
    }
    return icons;
  }
}

function i18n(translations, word) {
  return translations()?.[word] ?? word;
}

function PlyrAudioLayout() {
  return AudioControls();
}
function PlyrVideoLayout() {
  const media = useMediaContext(), { load } = media.$props, { canLoad } = media.$state, showLoadScreen = computed(() => load() === "play" && !canLoad());
  if (showLoadScreen()) {
    return [PlayLargeButton(), Poster()];
  }
  return [
    OptionalPlayLarge(),
    PreviewScrubbing(),
    Poster(),
    VideoControls(),
    Gestures(),
    Captions()
  ];
}
function PlayLargeButton() {
  const media = useMediaContext(), { translations } = usePlyrLayoutContext(), { title } = media.$state, $label = $signal(() => `${i18n(translations, "Play")}, ${title()}`);
  return html`
    <media-play-button
      class="plyr__control plyr__control--overlaid"
      aria-label=${$label}
      data-plyr="play"
    >
      <slot name="play-icon"></slot>
    </button>
  `;
}
function OptionalPlayLarge() {
  const { controls } = usePlyrLayoutContext();
  return $signal(() => controls().includes("play-large") ? PlayLargeButton() : null);
}
function PreviewScrubbing() {
  const { thumbnails, previewTime } = usePlyrLayoutContext();
  return html`
    <media-thumbnail
      .src=${$signal(thumbnails)}
      class="plyr__preview-scrubbing"
      time=${$signal(() => previewTime())}
    ></media-thumbnail>
  `;
}
function Poster() {
  const media = useMediaContext(), { poster } = media.$state, $style = $signal(() => `background-image: url("${poster()}");`);
  return html`<div class="plyr__poster" style=${$style}></div>`;
}
function AudioControls() {
  const ignore = /* @__PURE__ */ new Set(["captions", "pip", "airplay", "fullscreen"]), { controls } = usePlyrLayoutContext(), $controls = $signal(
    () => controls().filter((type) => !ignore.has(type)).map(Control)
  );
  return html`<div class="plyr__controls">${$controls}</div>`;
}
function VideoControls() {
  const { controls } = usePlyrLayoutContext(), $controls = $signal(() => controls().map(Control));
  return html`<div class="plyr__controls">${$controls}</div>`;
}
function Control(type) {
  switch (type) {
    case "airplay":
      return AirPlayButton();
    case "captions":
      return CaptionsButton();
    case "current-time":
      return CurrentTime();
    case "download":
      return DownloadButton();
    case "duration":
      return Duration();
    case "fast-forward":
      return FastForwardButton();
    case "fullscreen":
      return FullscreenButton();
    case "mute":
    case "volume":
    case "mute+volume":
      return Volume(type);
    case "pip":
      return PIPButton();
    case "play":
      return PlayButton();
    case "progress":
      return TimeSlider();
    case "restart":
      return RestartButton();
    case "rewind":
      return RewindButton();
    case "settings":
      return Settings();
    default:
      return null;
  }
}
function AirPlayButton() {
  const { translations } = usePlyrLayoutContext();
  return html`
    <media-airplay-button class="plyr__controls__item plyr__control" data-plyr="airplay">
      <slot name="airplay-icon"></slot>
      <span class="plyr__tooltip">${$i18n(translations, "AirPlay")}</span>
    </media-airplay-button>
  `;
}
function CaptionsButton() {
  const { translations } = usePlyrLayoutContext(), $disableText = $i18n(translations, "Disable captions"), $enableText = $i18n(translations, "Enable captions");
  return html`
    <media-caption-button
      class="plyr__controls__item plyr__control"
      data-no-label
      data-plyr="captions"
    >
      <slot name="captions-on-icon" data-class="icon--pressed"></slot>
      <slot name="captions-off-icon" data-class="icon--not-pressed"></slot>
      <span class="label--pressed plyr__tooltip">${$disableText}</span>
      <span class="label--not-pressed plyr__tooltip">${$enableText}</span>
    </media-caption-button>
  `;
}
function FullscreenButton() {
  const { translations } = usePlyrLayoutContext(), $enterText = $i18n(translations, "Enter Fullscreen"), $exitText = $i18n(translations, "Exit Fullscreen");
  return html`
    <media-fullscreen-button
      class="plyr__controls__item plyr__control"
      data-no-label
      data-plyr="fullscreen"
    >
      <slot name="enter-fullscreen-icon" data-class="icon--pressed"></slot>
      <slot name="exit-fullscreen-icon" data-class="icon--not-pressed"></slot>
      <span class="label--pressed plyr__tooltip">${$exitText}</span>
      <span class="label--not-pressed plyr__tooltip">${$enterText}</span>
    </media-fullscreen-button>
  `;
}
function MuteButton() {
  const { translations } = usePlyrLayoutContext(), $muteText = $i18n(translations, "Mute"), $unmuteText = $i18n(translations, "Unmute");
  return html`
    <media-mute-button class="plyr__control" data-no-label data-plyr="mute">
      <slot name="muted-icon" data-class="icon--pressed"></slot>
      <slot name="volume-icon" data-class="icon--not-pressed"></slot>
      <span class="label--pressed plyr__tooltip">${$unmuteText}</span>
      <span class="label--not-pressed plyr__tooltip">${$muteText}</span>
    </media-mute-button>
  `;
}
function PIPButton() {
  const { translations } = usePlyrLayoutContext(), $enterText = $i18n(translations, "Enter PiP"), $exitText = $i18n(translations, "Exit PiP");
  return html`
    <media-pip-button class="plyr__controls__item plyr__control" data-no-label data-plyr="pip">
      <slot name="pip-icon"></slot>
      <slot name="enter-pip-icon" data-class="icon--pressed"></slot>
      <slot name="exit-pip-icon" data-class="icon--not-pressed"></slot>
      <span class="label--pressed plyr__tooltip">${$exitText}</span>
      <span class="label--not-pressed plyr__tooltip">${$enterText}</span>
    </media-pip-button>
  `;
}
function PlayButton() {
  const { translations } = usePlyrLayoutContext(), $playText = $i18n(translations, "Play"), $pauseText = $i18n(translations, "Pause");
  return html`
    <media-play-button class="plyr__controls__item plyr__control" data-no-label data-plyr="play">
      <slot name="pause-icon" data-class="icon--pressed"></slot>
      <slot name="play-icon" data-class="icon--not-pressed"></slot>
      <span class="label--pressed plyr__tooltip">${$pauseText}</span>
      <span class="label--not-pressed plyr__tooltip">${$playText}</span>
    </media-play-button>
  `;
}
function RestartButton() {
  const { translations } = usePlyrLayoutContext(), { remote } = useMediaContext(), $restartText = $i18n(translations, "Restart");
  function onPress(event) {
    if (isKeyboardEvent(event) && !isKeyboardClick(event)) return;
    remote.seek(0, event);
  }
  return html`
    <button
      type="button"
      class="plyr__control"
      data-plyr="restart"
      @pointerup=${onPress}
      @keydown=${onPress}
    >
      <slot name="restart-icon"></slot>
      <span class="plyr__tooltip">${$restartText}</span>
    </button>
  `;
}
function RewindButton() {
  const { translations, seekTime } = usePlyrLayoutContext(), $label = $signal(() => `${i18n(translations, "Rewind")} ${seekTime()}s`), $seconds = $signal(() => -1 * seekTime());
  return html`
    <media-seek-button
      class="plyr__controls__item plyr__control"
      seconds=${$seconds}
      data-no-label
      data-plyr="rewind"
    >
      <slot name="rewind-icon"></slot>
      <span class="plyr__tooltip">${$label}</span>
    </media-seek-button>
  `;
}
function FastForwardButton() {
  const { translations, seekTime } = usePlyrLayoutContext(), $label = $signal(() => `${i18n(translations, "Forward")} ${seekTime()}s`), $seconds = $signal(seekTime);
  return html`
    <media-seek-button
      class="plyr__controls__item plyr__control"
      seconds=${$seconds}
      data-no-label
      data-plyr="fast-forward"
    >
      <slot name="fast-forward-icon"></slot>
      <span class="plyr__tooltip">${$label}</span>
    </media-seek-button>
  `;
}
function TimeSlider() {
  let media = useMediaContext(), { duration, viewType } = media.$state, { translations, markers, thumbnails, seekTime, previewTime } = usePlyrLayoutContext(), $seekText = $i18n(translations, "Seek"), activeMarker = signal(null), $markerLabel = $signal(() => {
    const marker = activeMarker();
    return marker ? html`<span class="plyr__progress__marker-label">${unsafeHTML(marker.label)}<br /></span>` : null;
  });
  function onSeekingRequest(event) {
    previewTime.set(event.detail);
  }
  function onMarkerEnter() {
    activeMarker.set(this);
  }
  function onMarkerLeave() {
    activeMarker.set(null);
  }
  function Preview() {
    const src = thumbnails(), $noClamp = $signal(() => viewType() === "audio");
    return !src ? html`
          <span class="plyr__tooltip">
            ${$markerLabel}
            <media-slider-value></media-slider-value>
          </span>
        ` : html`
          <media-slider-preview class="plyr__slider__preview" ?no-clamp=${$noClamp}>
            <media-slider-thumbnail .src=${src} class="plyr__slider__preview__thumbnail">
              <span class="plyr__slider__preview__time-container">
                ${$markerLabel}
                <media-slider-value class="plyr__slider__preview__time"></media-slider-value>
              </span>
            </media-slider-thumbnail>
          </media-slider-preview>
        `;
  }
  function Markers() {
    const endTime = duration();
    if (!Number.isFinite(endTime)) return null;
    return markers()?.map(
      (marker) => html`
        <span
          class="plyr__progress__marker"
          @mouseenter=${onMarkerEnter.bind(marker)}
          @mouseleave=${onMarkerLeave}
          style=${`left: ${marker.time / endTime * 100}%;`}
        ></span>
      `
    );
  }
  return html`
    <div class="plyr__controls__item plyr__progress__container">
      <div class="plyr__progress">
        <media-time-slider
          class="plyr__slider"
          data-plyr="seek"
          pause-while-dragging
          key-step=${$signal(seekTime)}
          aria-label=${$seekText}
          @media-seeking-request=${onSeekingRequest}
        >
          <div class="plyr__slider__track"></div>
          <div class="plyr__slider__thumb"></div>
          <div class="plyr__slider__buffer"></div>
          ${$signal(Preview)}${$signal(Markers)}
        </media-time-slider>
      </div>
    </div>
  `;
}
function Volume(type) {
  return $signal(() => {
    const hasMuteButton = type === "mute" || type === "mute+volume", hasVolumeSlider = type === "volume" || type === "mute+volume";
    return html`
      <div class="plyr__controls__item plyr__volume">
        ${[hasMuteButton ? MuteButton() : null, hasVolumeSlider ? VolumeSlider() : null]}
      </div>
    `;
  });
}
function VolumeSlider() {
  const { translations } = usePlyrLayoutContext(), $volumeText = $i18n(translations, "Volume");
  return html`
    <media-volume-slider class="plyr__slider" data-plyr="volume" aria-label=${$volumeText}>
      <div class="plyr__slider__track"></div>
      <div class="plyr__slider__thumb"></div>
    </media-volume-slider>
  `;
}
function CurrentTime() {
  const media = useMediaContext(), { translations, invertTime, toggleTime, displayDuration } = usePlyrLayoutContext(), invert = signal(peek(invertTime));
  function onPress(event) {
    if (!toggleTime() || displayDuration() || isKeyboardEvent(event) && !isKeyboardClick(event)) {
      return;
    }
    invert.set((n) => !n);
  }
  function MaybeDuration() {
    return $signal(() => displayDuration() ? Duration() : null);
  }
  return $signal(() => {
    const { streamType } = media.$state, $liveText = $i18n(translations, "LIVE"), $currentTimeText = $i18n(translations, "Current time"), $remainder = $signal(() => !displayDuration() && invert());
    return streamType() === "live" || streamType() === "ll-live" ? html`
          <media-live-button
            class="plyr__controls__item plyr__control plyr__live-button"
            data-plyr="live"
          >
            <span class="plyr__live-button__text">${$liveText}</span>
          </media-live-button>
        ` : html`
          <media-time
            type="current"
            class="plyr__controls__item plyr__time plyr__time--current"
            tabindex="0"
            role="timer"
            aria-label=${$currentTimeText}
            ?remainder=${$remainder}
            @pointerup=${onPress}
            @keydown=${onPress}
          ></media-time>
          ${MaybeDuration()}
        `;
  });
}
function Duration() {
  const { translations } = usePlyrLayoutContext(), $durationText = $i18n(translations, "Duration");
  return html`
    <media-time
      type="duration"
      class="plyr__controls__item plyr__time plyr__time--duration"
      role="timer"
      tabindex="0"
      aria-label=${$durationText}
    ></media-time>
  `;
}
function DownloadButton() {
  return $signal(() => {
    const media = useMediaContext(), { translations, download } = usePlyrLayoutContext(), { title, source } = media.$state, $src = source(), $download = download(), file = getDownloadFile({
      title: title(),
      src: $src,
      download: $download
    }), $downloadText = $i18n(translations, "Download");
    return isString(file?.url) ? html`
          <a
            class="plyr__controls__item plyr__control"
            href=${appendParamsToURL(file.url, { download: file.name })}
            download=${file.name}
            target="_blank"
          >
            <slot name="download-icon" />
            <span class="plyr__tooltip">${$downloadText}</span>
          </a>
        ` : null;
  });
}
function Gestures() {
  return $signal(() => {
    const { clickToPlay, clickToFullscreen } = usePlyrLayoutContext();
    return [
      clickToPlay() ? html`
            <media-gesture
              class="plyr__gesture"
              event="pointerup"
              action="toggle:paused"
            ></media-gesture>
          ` : null,
      clickToFullscreen() ? html`
            <media-gesture
              class="plyr__gesture"
              event="dblpointerup"
              action="toggle:fullscreen"
            ></media-gesture>
          ` : null
    ];
  });
}
function Captions() {
  const media = useMediaContext(), activeCue = signal(void 0), $cueText = $signal(() => unsafeHTML(activeCue()?.text));
  effect(() => {
    const track = media.$state.textTrack();
    if (!track) return;
    function onCueChange() {
      activeCue.set(track?.activeCues[0]);
    }
    onCueChange();
    return listenEvent(track, "cue-change", onCueChange);
  });
  return html`
    <div class="plyr__captions" dir="auto">
      <span class="plyr__caption">${$cueText}</span>
    </div>
  `;
}
function Settings() {
  const { translations } = usePlyrLayoutContext(), $settingsText = $i18n(translations, "Settings");
  return html`
    <div class="plyr__controls__item plyr__menu">
      <media-menu>
        <media-menu-button class="plyr__control" data-plyr="settings">
          <slot name="settings-icon" />
          <span class="plyr__tooltip">${$settingsText}</span>
        </media-menu-button>
        <media-menu-items class="plyr__menu__container" placement="top end">
          <div><div>${[AudioMenu(), CaptionsMenu(), QualityMenu(), SpeedMenu()]}</div></div>
        </media-menu-items>
      </media-menu>
    </div>
  `;
}
function Menu({ label, children }) {
  const open = signal(false), onOpen = () => open.set(true), onClose = () => open.set(false);
  return html`
    <media-menu @open=${onOpen} @close=${onClose}>
      ${MenuButton({ label, open })}
      <media-menu-items>${children}</media-menu-items>
    </media-menu>
  `;
}
function MenuButton({ open, label }) {
  const { translations } = usePlyrLayoutContext(), $class = $signal(() => `plyr__control plyr__control--${open() ? "back" : "forward"}`);
  function GoBackText() {
    const $text = $i18n(translations, "Go back to previous menu");
    return $signal(() => open() ? html`<span class="plyr__sr-only">${$text}</span>` : null);
  }
  return html`
    <media-menu-button class=${$class} data-plyr="settings">
      <span class="plyr__menu__label" aria-hidden=${$aria(open)}>
        ${$i18n(translations, label)}
      </span>
      <span class="plyr__menu__value" data-part="hint"></span>
      ${GoBackText()}
    </media-menu-button>
  `;
}
function AudioMenu() {
  return Menu({ label: "Audio", children: AudioRadioGroup() });
}
function AudioRadioGroup() {
  const { translations } = usePlyrLayoutContext();
  return html`
    <media-audio-radio-group empty-label=${$i18n(translations, "Default")}>
      <template>
        <media-radio class="plyr__control" data-plyr="audio">
          <span data-part="label"></span>
        </media-radio>
      </template>
    </media-audio-radio-group>
  `;
}
function SpeedMenu() {
  return Menu({ label: "Speed", children: SpeedRadioGroup() });
}
function SpeedRadioGroup() {
  const { translations, speed } = usePlyrLayoutContext();
  return html`
    <media-speed-radio-group .rates=${speed} normal-label=${$i18n(translations, "Normal")}>
      <template>
        <media-radio class="plyr__control" data-plyr="speed">
          <span data-part="label"></span>
        </media-radio>
      </template>
    </media-speed-radio-group>
  `;
}
function CaptionsMenu() {
  return Menu({ label: "Captions", children: CaptionsRadioGroup() });
}
function CaptionsRadioGroup() {
  const { translations } = usePlyrLayoutContext();
  return html`
    <media-captions-radio-group off-label=${$i18n(translations, "Disabled")}>
      <template>
        <media-radio class="plyr__control" data-plyr="captions">
          <span data-part="label"></span>
        </media-radio>
      </template>
    </media-captions-radio-group>
  `;
}
function QualityMenu() {
  return Menu({ label: "Quality", children: QualityRadioGroup() });
}
function QualityRadioGroup() {
  const { translations } = usePlyrLayoutContext();
  return html`
    <media-quality-radio-group auto-label=${$i18n(translations, "Auto")}>
      <template>
        <media-radio class="plyr__control" data-plyr="quality">
          <span data-part="label"></span>
        </media-radio>
      </template>
    </media-quality-radio-group>
  `;
}
function $aria(signal2) {
  return $signal(() => signal2() ? "true" : "false");
}
function $i18n(translations, word) {
  return $signal(() => i18n(translations, word));
}

class MediaPlyrLayoutElement extends Host(LitElement, PlyrLayout) {
  static tagName = "media-plyr-layout";
  #media;
  onSetup() {
    this.forwardKeepAlive = false;
    this.#media = useMediaContext();
  }
  onConnect() {
    this.#media.player.el?.setAttribute("data-layout", "plyr");
    onDispose(() => this.#media.player.el?.removeAttribute("data-layout"));
    usePlyrLayoutClasses(this, this.#media);
    effect(() => {
      if (this.$props.customIcons()) {
        new SlotManager([this]).connect();
      } else {
        new PlyrLayoutIconsLoader([this]).connect();
      }
    });
  }
  render() {
    return $signal(this.#render.bind(this));
  }
  #render() {
    const { viewType } = this.#media.$state;
    return viewType() === "audio" ? PlyrAudioLayout() : viewType() === "video" ? PlyrVideoLayout() : null;
  }
}

defineCustomElement(MediaPlyrLayoutElement);
defineCustomElement(MediaPosterElement);
defineCustomElement(MediaPlayButtonElement);
defineCustomElement(MediaMuteButtonElement);
defineCustomElement(MediaCaptionButtonElement);
defineCustomElement(MediaPIPButtonElement);
defineCustomElement(MediaFullscreenButtonElement);
defineCustomElement(MediaSeekButtonElement);
defineCustomElement(MediaAirPlayButtonElement);
defineCustomElement(MediaLiveButtonElement);
defineCustomElement(MediaVolumeSliderElement);
defineCustomElement(MediaTimeSliderElement);
defineCustomElement(MediaSliderPreviewElement);
defineCustomElement(MediaSliderThumbnailElement);
defineCustomElement(MediaSliderValueElement);
defineCustomElement(MediaMenuElement);
defineCustomElement(MediaMenuButtonElement);
defineCustomElement(MediaMenuItemsElement);
defineCustomElement(MediaMenuItemElement);
defineCustomElement(MediaAudioRadioGroupElement);
defineCustomElement(MediaCaptionsRadioGroupElement);
defineCustomElement(MediaSpeedRadioGroupElement);
defineCustomElement(MediaQualityRadioGroupElement);
defineCustomElement(MediaRadioElement);
defineCustomElement(MediaTimeElement);
defineCustomElement(MediaThumbnailElement);

var plyr = /*#__PURE__*/Object.freeze({
  __proto__: null
});

class GoogleCastMediaInfoBuilder {
  #info;
  constructor(src) {
    this.#info = new chrome.cast.media.MediaInfo(src.src, src.type);
  }
  build() {
    return this.#info;
  }
  setStreamType(streamType) {
    if (streamType.includes("live")) {
      this.#info.streamType = chrome.cast.media.StreamType.LIVE;
    } else {
      this.#info.streamType = chrome.cast.media.StreamType.BUFFERED;
    }
    return this;
  }
  setTracks(tracks) {
    this.#info.tracks = tracks.map(this.#buildCastTrack);
    return this;
  }
  setMetadata(title, poster) {
    this.#info.metadata = new chrome.cast.media.GenericMediaMetadata();
    this.#info.metadata.title = title;
    this.#info.metadata.images = [{ url: poster }];
    return this;
  }
  #buildCastTrack(track, trackId) {
    const castTrack = new chrome.cast.media.Track(trackId, chrome.cast.media.TrackType.TEXT);
    castTrack.name = track.label;
    castTrack.trackContentId = track.src;
    castTrack.trackContentType = "text/vtt";
    castTrack.language = track.language;
    castTrack.subtype = track.kind.toUpperCase();
    return castTrack;
  }
}

class GoogleCastTracksManager {
  #cast;
  #ctx;
  #onNewLocalTracks;
  constructor(cast, ctx, onNewLocalTracks) {
    this.#cast = cast;
    this.#ctx = ctx;
    this.#onNewLocalTracks = onNewLocalTracks;
  }
  setup() {
    const syncRemoteActiveIds = this.syncRemoteActiveIds.bind(this);
    listenEvent(this.#ctx.audioTracks, "change", syncRemoteActiveIds);
    listenEvent(this.#ctx.textTracks, "mode-change", syncRemoteActiveIds);
    effect(this.#syncLocalTracks.bind(this));
  }
  getLocalTextTracks() {
    return this.#ctx.$state.textTracks().filter((track) => track.src && track.type === "vtt");
  }
  #getLocalAudioTracks() {
    return this.#ctx.$state.audioTracks();
  }
  #getRemoteTracks(type) {
    const tracks = this.#cast.mediaInfo?.tracks ?? [];
    return type ? tracks.filter((track) => track.type === type) : tracks;
  }
  #getRemoteActiveIds() {
    const activeIds = [], activeLocalAudioTrack = this.#getLocalAudioTracks().find((track) => track.selected), activeLocalTextTracks = this.getLocalTextTracks().filter((track) => track.mode === "showing");
    if (activeLocalAudioTrack) {
      const remoteAudioTracks = this.#getRemoteTracks(chrome.cast.media.TrackType.AUDIO), remoteAudioTrack = this.#findRemoteTrack(remoteAudioTracks, activeLocalAudioTrack);
      if (remoteAudioTrack) activeIds.push(remoteAudioTrack.trackId);
    }
    if (activeLocalTextTracks?.length) {
      const remoteTextTracks = this.#getRemoteTracks(chrome.cast.media.TrackType.TEXT);
      if (remoteTextTracks.length) {
        for (const localTrack of activeLocalTextTracks) {
          const remoteTextTrack = this.#findRemoteTrack(remoteTextTracks, localTrack);
          if (remoteTextTrack) activeIds.push(remoteTextTrack.trackId);
        }
      }
    }
    return activeIds;
  }
  #syncLocalTracks() {
    const localTextTracks = this.getLocalTextTracks();
    if (!this.#cast.isMediaLoaded) return;
    const remoteTextTracks = this.#getRemoteTracks(chrome.cast.media.TrackType.TEXT);
    for (const localTrack of localTextTracks) {
      const hasRemoteTrack = this.#findRemoteTrack(remoteTextTracks, localTrack);
      if (!hasRemoteTrack) {
        untrack(() => this.#onNewLocalTracks?.());
        break;
      }
    }
  }
  syncRemoteTracks(event) {
    if (!this.#cast.isMediaLoaded) return;
    const localAudioTracks = this.#getLocalAudioTracks(), localTextTracks = this.getLocalTextTracks(), remoteAudioTracks = this.#getRemoteTracks(chrome.cast.media.TrackType.AUDIO), remoteTextTracks = this.#getRemoteTracks(chrome.cast.media.TrackType.TEXT);
    for (const remoteAudioTrack of remoteAudioTracks) {
      const hasLocalTrack = this.#findLocalTrack(localAudioTracks, remoteAudioTrack);
      if (hasLocalTrack) continue;
      const localAudioTrack = {
        id: remoteAudioTrack.trackId.toString(),
        label: remoteAudioTrack.name,
        language: remoteAudioTrack.language,
        kind: remoteAudioTrack.subtype ?? "main",
        selected: false
      };
      this.#ctx.audioTracks[ListSymbol.add](localAudioTrack, event);
    }
    for (const remoteTextTrack of remoteTextTracks) {
      const hasLocalTrack = this.#findLocalTrack(localTextTracks, remoteTextTrack);
      if (hasLocalTrack) continue;
      const localTextTrack = {
        id: remoteTextTrack.trackId.toString(),
        src: remoteTextTrack.trackContentId,
        label: remoteTextTrack.name,
        language: remoteTextTrack.language,
        kind: remoteTextTrack.subtype.toLowerCase()
      };
      this.#ctx.textTracks.add(localTextTrack, event);
    }
  }
  syncRemoteActiveIds(event) {
    if (!this.#cast.isMediaLoaded) return;
    const activeIds = this.#getRemoteActiveIds(), editRequest = new chrome.cast.media.EditTracksInfoRequest(activeIds);
    this.#editTracksInfo(editRequest).catch((error) => {
      {
        this.#ctx.logger?.errorGroup("[vidstack] failed to edit cast tracks info").labelledLog("Edit Request", editRequest).labelledLog("Error", error).dispatch();
      }
    });
  }
  #editTracksInfo(request) {
    const media = getCastSessionMedia();
    return new Promise((resolve, reject) => media?.editTracksInfo(request, resolve, reject));
  }
  #findLocalTrack(localTracks, remoteTrack) {
    return localTracks.find((localTrack) => this.#isMatch(localTrack, remoteTrack));
  }
  #findRemoteTrack(remoteTracks, localTrack) {
    return remoteTracks.find((remoteTrack) => this.#isMatch(localTrack, remoteTrack));
  }
  // Note: we can't rely on id matching because they will differ between local/remote. A local
  // track id might not even exist.
  #isMatch(localTrack, remoteTrack) {
    return remoteTrack.name === localTrack.label && remoteTrack.language === localTrack.language && remoteTrack.subtype.toLowerCase() === localTrack.kind.toLowerCase();
  }
}

class GoogleCastProvider {
  $$PROVIDER_TYPE = "GOOGLE_CAST";
  scope = createScope();
  #player;
  #ctx;
  #tracks;
  #currentSrc = null;
  #state = "disconnected";
  #currentTime = 0;
  #played = 0;
  #seekableRange = new TimeRange(0, 0);
  #timeRAF = new RAFLoop(this.#onAnimationFrame.bind(this));
  #playerEventHandlers;
  #reloadInfo = null;
  #isIdle = false;
  constructor(player, ctx) {
    this.#player = player;
    this.#ctx = ctx;
    this.#tracks = new GoogleCastTracksManager(player, ctx, this.#onNewLocalTracks.bind(this));
  }
  get type() {
    return "google-cast";
  }
  get currentSrc() {
    return this.#currentSrc;
  }
  /**
   * The Google Cast remote player.
   *
   * @see {@link https://developers.google.com/cast/docs/reference/web_sender/cast.framework.RemotePlayer}
   */
  get player() {
    return this.#player;
  }
  /**
   * @see {@link https://developers.google.com/cast/docs/reference/web_sender/cast.framework.CastContext}
   */
  get cast() {
    return getCastContext();
  }
  /**
   * @see {@link https://developers.google.com/cast/docs/reference/web_sender/cast.framework.CastSession}
   */
  get session() {
    return getCastSession();
  }
  /**
   * @see {@link https://developers.google.com/cast/docs/reference/web_sender/chrome.cast.media.Media}
   */
  get media() {
    return getCastSessionMedia();
  }
  /**
   * Whether the current Google Cast session belongs to this provider.
   */
  get hasActiveSession() {
    return hasActiveCastSession(this.#currentSrc);
  }
  setup() {
    this.#attachCastContextEventListeners();
    this.#attachCastPlayerEventListeners();
    this.#tracks.setup();
    this.#ctx.notify("provider-setup", this);
  }
  #attachCastContextEventListeners() {
    listenCastContextEvent(
      cast.framework.CastContextEventType.CAST_STATE_CHANGED,
      this.#onCastStateChange.bind(this)
    );
  }
  #attachCastPlayerEventListeners() {
    const Event2 = cast.framework.RemotePlayerEventType, handlers = {
      [Event2.IS_CONNECTED_CHANGED]: this.#onCastStateChange,
      [Event2.IS_MEDIA_LOADED_CHANGED]: this.#onMediaLoadedChange,
      [Event2.CAN_CONTROL_VOLUME_CHANGED]: this.#onCanControlVolumeChange,
      [Event2.CAN_SEEK_CHANGED]: this.#onCanSeekChange,
      [Event2.DURATION_CHANGED]: this.#onDurationChange,
      [Event2.IS_MUTED_CHANGED]: this.#onVolumeChange,
      [Event2.VOLUME_LEVEL_CHANGED]: this.#onVolumeChange,
      [Event2.IS_PAUSED_CHANGED]: this.#onPausedChange,
      [Event2.LIVE_SEEKABLE_RANGE_CHANGED]: this.#onProgress,
      [Event2.PLAYER_STATE_CHANGED]: this.#onPlayerStateChange
    };
    this.#playerEventHandlers = handlers;
    const handler = this.#onRemotePlayerEvent.bind(this);
    for (const type of keysOf(handlers)) {
      this.#player.controller.addEventListener(type, handler);
    }
    onDispose(() => {
      for (const type of keysOf(handlers)) {
        this.#player.controller.removeEventListener(type, handler);
      }
    });
  }
  async play() {
    if (!this.#player.isPaused && !this.#isIdle) return;
    if (this.#isIdle) {
      await this.#reload(false, 0);
      return;
    }
    this.#player.controller?.playOrPause();
  }
  async pause() {
    if (this.#player.isPaused) return;
    this.#player.controller?.playOrPause();
  }
  getMediaStatus(request) {
    return new Promise((resolve, reject) => {
      this.media?.getStatus(request, resolve, reject);
    });
  }
  setMuted(muted) {
    const hasChanged = muted && !this.#player.isMuted || !muted && this.#player.isMuted;
    if (hasChanged) this.#player.controller?.muteOrUnmute();
  }
  setCurrentTime(time) {
    this.#player.currentTime = time;
    this.#ctx.notify("seeking", time);
    this.#player.controller?.seek();
  }
  setVolume(volume) {
    this.#player.volumeLevel = volume;
    this.#player.controller?.setVolumeLevel();
  }
  async loadSource(src) {
    if (this.#reloadInfo?.src !== src) this.#reloadInfo = null;
    if (hasActiveCastSession(src)) {
      this.#resumeSession();
      this.#currentSrc = src;
      return;
    }
    this.#ctx.notify("load-start");
    const loadRequest = this.#buildLoadRequest(src), errorCode = await this.session.loadMedia(loadRequest);
    if (errorCode) {
      this.#currentSrc = null;
      this.#ctx.notify("error", Error(getCastErrorMessage(errorCode)));
      return;
    }
    this.#currentSrc = src;
  }
  destroy() {
    this.#reset();
    this.#endSession();
  }
  #reset() {
    if (!this.#reloadInfo) {
      this.#played = 0;
      this.#seekableRange = new TimeRange(0, 0);
    }
    this.#timeRAF.stop();
    this.#currentTime = 0;
    this.#reloadInfo = null;
  }
  #resumeSession() {
    const resumeSessionEvent = new DOMEvent("resume-session", { detail: this.session });
    this.#onMediaLoadedChange(resumeSessionEvent);
    const { muted, volume, savedState } = this.#ctx.$state, localState = savedState();
    this.setCurrentTime(Math.max(this.#player.currentTime, localState?.currentTime ?? 0));
    this.setMuted(muted());
    this.setVolume(volume());
    if (localState?.paused === false) this.play();
  }
  #endSession() {
    this.cast.endCurrentSession(true);
    const { remotePlaybackLoader } = this.#ctx.$state;
    remotePlaybackLoader.set(null);
  }
  #disconnectFromReceiver() {
    const { savedState } = this.#ctx.$state;
    savedState.set({
      paused: this.#player.isPaused,
      currentTime: this.#player.currentTime
    });
    this.#endSession();
  }
  #onAnimationFrame() {
    this.#onCurrentTimeChange();
  }
  #onRemotePlayerEvent(event) {
    this.#playerEventHandlers[event.type].call(this, event);
  }
  #onCastStateChange(data) {
    const castState = this.cast.getCastState(), state = castState === cast.framework.CastState.CONNECTED ? "connected" : castState === cast.framework.CastState.CONNECTING ? "connecting" : "disconnected";
    if (this.#state === state) return;
    const detail = { type: "google-cast", state }, trigger = this.#createEvent(data);
    this.#state = state;
    this.#ctx.notify("remote-playback-change", detail, trigger);
    if (state === "disconnected") {
      this.#disconnectFromReceiver();
    }
  }
  #onMediaLoadedChange(event) {
    const hasLoaded = !!this.#player.isMediaLoaded;
    if (!hasLoaded) return;
    const src = peek(this.#ctx.$state.source);
    Promise.resolve().then(() => {
      if (src !== peek(this.#ctx.$state.source) || !this.#player.isMediaLoaded) return;
      this.#reset();
      const duration = this.#player.duration;
      this.#seekableRange = new TimeRange(0, duration);
      const detail = {
        provider: this,
        duration,
        buffered: new TimeRange(0, 0),
        seekable: this.#getSeekableRange()
      }, trigger = this.#createEvent(event);
      this.#ctx.notify("loaded-metadata", void 0, trigger);
      this.#ctx.notify("loaded-data", void 0, trigger);
      this.#ctx.notify("can-play", detail, trigger);
      this.#onCanControlVolumeChange();
      this.#onCanSeekChange(event);
      const { volume, muted } = this.#ctx.$state;
      this.setVolume(volume());
      this.setMuted(muted());
      this.#timeRAF.start();
      this.#tracks.syncRemoteTracks(trigger);
      this.#tracks.syncRemoteActiveIds(trigger);
    });
  }
  #onCanControlVolumeChange() {
    this.#ctx.$state.canSetVolume.set(this.#player.canControlVolume);
  }
  #onCanSeekChange(event) {
    const trigger = this.#createEvent(event);
    this.#ctx.notify("stream-type-change", this.#getStreamType(), trigger);
  }
  #getStreamType() {
    const streamType = this.#player.mediaInfo?.streamType;
    return streamType === chrome.cast.media.StreamType.LIVE ? this.#player.canSeek ? "live:dvr" : "live" : "on-demand";
  }
  #onCurrentTimeChange() {
    if (this.#reloadInfo) return;
    const currentTime = this.#player.currentTime;
    if (currentTime === this.#currentTime) return;
    this.#ctx.notify("time-change", currentTime);
    if (currentTime > this.#played) {
      this.#played = currentTime;
      this.#onProgress();
    }
    if (this.#ctx.$state.seeking()) {
      this.#ctx.notify("seeked", currentTime);
    }
    this.#currentTime = currentTime;
  }
  #onDurationChange(event) {
    if (!this.#player.isMediaLoaded || this.#reloadInfo) return;
    const duration = this.#player.duration, trigger = this.#createEvent(event);
    this.#seekableRange = new TimeRange(0, duration);
    this.#ctx.notify("duration-change", duration, trigger);
  }
  #onVolumeChange(event) {
    if (!this.#player.isMediaLoaded) return;
    const detail = {
      muted: this.#player.isMuted,
      volume: this.#player.volumeLevel
    }, trigger = this.#createEvent(event);
    this.#ctx.notify("volume-change", detail, trigger);
  }
  #onPausedChange(event) {
    const trigger = this.#createEvent(event);
    if (this.#player.isPaused) {
      this.#ctx.notify("pause", void 0, trigger);
    } else {
      this.#ctx.notify("play", void 0, trigger);
    }
  }
  #onProgress(event) {
    const detail = {
      seekable: this.#getSeekableRange(),
      buffered: new TimeRange(0, this.#played)
    }, trigger = event ? this.#createEvent(event) : void 0;
    this.#ctx.notify("progress", detail, trigger);
  }
  #onPlayerStateChange(event) {
    const state = this.#player.playerState, PlayerState = chrome.cast.media.PlayerState;
    this.#isIdle = state === PlayerState.IDLE;
    if (state === PlayerState.PAUSED) return;
    const trigger = this.#createEvent(event);
    switch (state) {
      case PlayerState.PLAYING:
        this.#ctx.notify("playing", void 0, trigger);
        break;
      case PlayerState.BUFFERING:
        this.#ctx.notify("waiting", void 0, trigger);
        break;
      case PlayerState.IDLE:
        this.#timeRAF.stop();
        this.#ctx.notify("pause");
        this.#ctx.notify("end");
        break;
    }
  }
  #getSeekableRange() {
    return this.#player.liveSeekableRange ? new TimeRange(this.#player.liveSeekableRange.start, this.#player.liveSeekableRange.end) : this.#seekableRange;
  }
  #createEvent(detail) {
    return detail instanceof Event ? detail : new DOMEvent(detail.type, { detail });
  }
  #buildMediaInfo(src) {
    const { streamType, title, poster } = this.#ctx.$state;
    return new GoogleCastMediaInfoBuilder(src).setMetadata(title(), poster()).setStreamType(streamType()).setTracks(this.#tracks.getLocalTextTracks()).build();
  }
  #buildLoadRequest(src) {
    const mediaInfo = this.#buildMediaInfo(src), request = new chrome.cast.media.LoadRequest(mediaInfo), savedState = this.#ctx.$state.savedState();
    request.autoplay = (this.#reloadInfo?.paused ?? savedState?.paused) === false;
    request.currentTime = this.#reloadInfo?.time ?? savedState?.currentTime ?? 0;
    return request;
  }
  async #reload(paused, time) {
    const src = peek(this.#ctx.$state.source);
    this.#reloadInfo = { src, paused, time };
    await this.loadSource(src);
  }
  #onNewLocalTracks() {
    this.#reload(this.#player.isPaused, this.#player.currentTime).catch((error) => {
      {
        this.#ctx.logger?.errorGroup("[vidstack] cast failed to load new local tracks").labelledLog("Error", error).dispatch();
      }
    });
  }
}

var provider = /*#__PURE__*/Object.freeze({
  __proto__: null,
  GoogleCastProvider: GoogleCastProvider
});

var airplay = `<g><path d="M16,1 L2,1 C1.447,1 1,1.447 1,2 L1,12 C1,12.553 1.447,13 2,13 L5,13 L5,11 L3,11 L3,3 L15,3 L15,11 L13,11 L13,13 L16,13 C16.553,13 17,12.553 17,12 L17,2 C17,1.447 16.553,1 16,1 L16,1 Z"></path><polygon points="4 17 14 17 9 11"></polygon></g>`;

var captionsOff = `<g fill-rule="evenodd" fill-opacity="0.5"><path d="M1,1 C0.4,1 0,1.4 0,2 L0,13 C0,13.6 0.4,14 1,14 L5.6,14 L8.3,16.7 C8.5,16.9 8.7,17 9,17 C9.3,17 9.5,16.9 9.7,16.7 L12.4,14 L17,14 C17.6,14 18,13.6 18,13 L18,2 C18,1.4 17.6,1 17,1 L1,1 Z M5.52,11.15 C7.51,11.15 8.53,9.83 8.8,8.74 L7.51,8.35 C7.32,9.01 6.73,9.8 5.52,9.8 C4.38,9.8 3.32,8.97 3.32,7.46 C3.32,5.85 4.44,5.09 5.5,5.09 C6.73,5.09 7.28,5.84 7.45,6.52 L8.75,6.11 C8.47,4.96 7.46,3.76 5.5,3.76 C3.6,3.76 1.89,5.2 1.89,7.46 C1.89,9.72 3.54,11.15 5.52,11.15 Z M13.09,11.15 C15.08,11.15 16.1,9.83 16.37,8.74 L15.08,8.35 C14.89,9.01 14.3,9.8 13.09,9.8 C11.95,9.8 10.89,8.97 10.89,7.46 C10.89,5.85 12.01,5.09 13.07,5.09 C14.3,5.09 14.85,5.84 15.02,6.52 L16.32,6.11 C16.04,4.96 15.03,3.76 13.07,3.76 C11.17,3.76 9.46,5.2 9.46,7.46 C9.46,9.72 11.11,11.15 13.09,11.15 Z"></path></g>`;

var captionsOn = `<g fill-rule="evenodd"><path d="M1,1 C0.4,1 0,1.4 0,2 L0,13 C0,13.6 0.4,14 1,14 L5.6,14 L8.3,16.7 C8.5,16.9 8.7,17 9,17 C9.3,17 9.5,16.9 9.7,16.7 L12.4,14 L17,14 C17.6,14 18,13.6 18,13 L18,2 C18,1.4 17.6,1 17,1 L1,1 Z M5.52,11.15 C7.51,11.15 8.53,9.83 8.8,8.74 L7.51,8.35 C7.32,9.01 6.73,9.8 5.52,9.8 C4.38,9.8 3.32,8.97 3.32,7.46 C3.32,5.85 4.44,5.09 5.5,5.09 C6.73,5.09 7.28,5.84 7.45,6.52 L8.75,6.11 C8.47,4.96 7.46,3.76 5.5,3.76 C3.6,3.76 1.89,5.2 1.89,7.46 C1.89,9.72 3.54,11.15 5.52,11.15 Z M13.09,11.15 C15.08,11.15 16.1,9.83 16.37,8.74 L15.08,8.35 C14.89,9.01 14.3,9.8 13.09,9.8 C11.95,9.8 10.89,8.97 10.89,7.46 C10.89,5.85 12.01,5.09 13.07,5.09 C14.3,5.09 14.85,5.84 15.02,6.52 L16.32,6.11 C16.04,4.96 15.03,3.76 13.07,3.76 C11.17,3.76 9.46,5.2 9.46,7.46 C9.46,9.72 11.11,11.15 13.09,11.15 Z"></path></g>`;

var download = `<g transform="translate(2 1)"><path d="M7,12 C7.3,12 7.5,11.9 7.7,11.7 L13.4,6 L12,4.6 L8,8.6 L8,0 L6,0 L6,8.6 L2,4.6 L0.6,6 L6.3,11.7 C6.5,11.9 6.7,12 7,12 Z" /><rect width="14" height="2" y="14" /></g>`;

var exitFullscreen = `<polygon points="10 3 13.6 3 9.6 7 11 8.4 15 4.4 15 8 17 8 17 1 10 1"></polygon><polygon points="7 9.6 3 13.6 3 10 1 10 1 17 8 17 8 15 4.4 15 8.4 11"></polygon>`;

var enterFullscreen = `<polygon points="1 12 4.6 12 0.6 16 2 17.4 6 13.4 6 17 8 17 8 10 1 10"></polygon><polygon points="16 0.6 12 4.6 12 1 10 1 10 8 17 8 17 6 13.4 6 17.4 2"></polygon>`;

var fastForward = `<polygon points="7.875 7.17142857 0 1 0 17 7.875 10.8285714 7.875 17 18 9 7.875 1"></polygon>`;

var muted = `<polygon points="12.4 12.5 14.5 10.4 16.6 12.5 18 11.1 15.9 9 18 6.9 16.6 5.5 14.5 7.6 12.4 5.5 11 6.9 13.1 9 11 11.1"></polygon><path d="M3.78571429,6.00820648 L0.714285714,6.00820648 C0.285714286,6.00820648 0,6.30901277 0,6.76022222 L0,11.2723167 C0,11.7235261 0.285714286,12.0243324 0.714285714,12.0243324 L3.78571429,12.0243324 L7.85714286,15.8819922 C8.35714286,16.1827985 9,15.8819922 9,15.2803796 L9,2.75215925 C9,2.15054666 8.35714286,1.77453879 7.85714286,2.15054666 L3.78571429,6.00820648 Z"></path>`;

var pause = `<path d="M6,1 L3,1 C2.4,1 2,1.4 2,2 L2,16 C2,16.6 2.4,17 3,17 L6,17 C6.6,17 7,16.6 7,16 L7,2 C7,1.4 6.6,1 6,1 L6,1 Z"></path><path d="M12,1 C11.4,1 11,1.4 11,2 L11,16 C11,16.6 11.4,17 12,17 L15,17 C15.6,17 16,16.6 16,16 L16,2 C16,1.4 15.6,1 15,1 L12,1 Z"></path>`;

var pip = `<polygon points="13.293 3.293 7.022 9.564 8.436 10.978 14.707 4.707 17 7 17 1 11 1"></polygon><path d="M13,15 L3,15 L3,5 L8,5 L8,3 L2,3 C1.448,3 1,3.448 1,4 L1,16 C1,16.552 1.448,17 2,17 L14,17 C14.552,17 15,16.552 15,16 L15,10 L13,10 L13,15 L13,15 Z"></path>`;

var play = `<path d="M15.5615866,8.10002147 L3.87056367,0.225209313 C3.05219207,-0.33727727 2,0.225209313 2,1.12518784 L2,16.8748122 C2,17.7747907 3.05219207,18.3372773 3.87056367,17.7747907 L15.5615866,9.89997853 C16.1461378,9.44998927 16.1461378,8.55001073 15.5615866,8.10002147 L15.5615866,8.10002147 Z"></path>`;

var restart = `<path d="M9.7,1.2 L10.4,7.6 L12.5,5.5 C14.4,7.4 14.4,10.6 12.5,12.5 C11.6,13.5 10.3,14 9,14 C7.7,14 6.4,13.5 5.5,12.5 C3.6,10.6 3.6,7.4 5.5,5.5 C6.1,4.9 6.9,4.4 7.8,4.2 L7.2,2.3 C6,2.6 4.9,3.2 4,4.1 C1.3,6.8 1.3,11.2 4,14 C5.3,15.3 7.1,16 8.9,16 C10.8,16 12.5,15.3 13.8,14 C16.5,11.3 16.5,6.9 13.8,4.1 L16,1.9 L9.7,1.2 L9.7,1.2 Z"></path>`;

var rewind = `<polygon points="10.125 1 0 9 10.125 17 10.125 10.8285714 18 17 18 1 10.125 7.17142857"></polygon>`;

var settings = `<path d="M16.135,7.784 C14.832,7.458 14.214,5.966 14.905,4.815 C15.227,4.279 15.13,3.817 14.811,3.499 L14.501,3.189 C14.183,2.871 13.721,2.774 13.185,3.095 C12.033,3.786 10.541,3.168 10.216,1.865 C10.065,1.258 9.669,1 9.219,1 L8.781,1 C8.331,1 7.936,1.258 7.784,1.865 C7.458,3.168 5.966,3.786 4.815,3.095 C4.279,2.773 3.816,2.87 3.498,3.188 L3.188,3.498 C2.87,3.816 2.773,4.279 3.095,4.815 C3.786,5.967 3.168,7.459 1.865,7.784 C1.26,7.935 1,8.33 1,8.781 L1,9.219 C1,9.669 1.258,10.064 1.865,10.216 C3.168,10.542 3.786,12.034 3.095,13.185 C2.773,13.721 2.87,14.183 3.189,14.501 L3.499,14.811 C3.818,15.13 4.281,15.226 4.815,14.905 C5.967,14.214 7.459,14.832 7.784,16.135 C7.935,16.742 8.331,17 8.781,17 L9.219,17 C9.669,17 10.064,16.742 10.216,16.135 C10.542,14.832 12.034,14.214 13.185,14.905 C13.72,15.226 14.182,15.13 14.501,14.811 L14.811,14.501 C15.129,14.183 15.226,13.72 14.905,13.185 C14.214,12.033 14.832,10.541 16.135,10.216 C16.742,10.065 17,9.669 17,9.219 L17,8.781 C17,8.33 16.74,7.935 16.135,7.784 L16.135,7.784 Z M9,12 C7.343,12 6,10.657 6,9 C6,7.343 7.343,6 9,6 C10.657,6 12,7.343 12,9 C12,10.657 10.657,12 9,12 L9,12 Z"></path>`;

var volume = `<path d="M15.5999996,3.3 C15.1999996,2.9 14.5999996,2.9 14.1999996,3.3 C13.7999996,3.7 13.7999996,4.3 14.1999996,4.7 C15.3999996,5.9 15.9999996,7.4 15.9999996,9 C15.9999996,10.6 15.3999996,12.1 14.1999996,13.3 C13.7999996,13.7 13.7999996,14.3 14.1999996,14.7 C14.3999996,14.9 14.6999996,15 14.8999996,15 C15.1999996,15 15.3999996,14.9 15.5999996,14.7 C17.0999996,13.2 17.9999996,11.2 17.9999996,9 C17.9999996,6.8 17.0999996,4.8 15.5999996,3.3 L15.5999996,3.3 Z"></path><path d="M11.2819745,5.28197449 C10.9060085,5.65794047 10.9060085,6.22188944 11.2819745,6.59785542 C12.0171538,7.33303477 12.2772954,8.05605449 12.2772954,9.00000021 C12.2772954,9.93588462 11.851678,10.9172014 11.2819745,11.4869049 C10.9060085,11.8628709 10.9060085,12.4268199 11.2819745,12.8027859 C11.4271642,12.9479755 11.9176724,13.0649528 12.2998149,12.9592565 C12.4124479,12.9281035 12.5156669,12.8776063 12.5978555,12.8027859 C13.773371,11.732654 14.1311161,10.1597914 14.1312523,9.00000021 C14.1312723,8.8299555 14.1286311,8.66015647 14.119665,8.4897429 C14.0674781,7.49784946 13.8010171,6.48513613 12.5978554,5.28197449 C12.2218894,4.9060085 11.6579405,4.9060085 11.2819745,5.28197449 Z"></path><path d="M3.78571429,6.00820648 L0.714285714,6.00820648 C0.285714286,6.00820648 0,6.30901277 0,6.76022222 L0,11.2723167 C0,11.7235261 0.285714286,12.0243324 0.714285714,12.0243324 L3.78571429,12.0243324 L7.85714286,15.8819922 C8.35714286,16.1827985 9,15.8819922 9,15.2803796 L9,2.75215925 C9,2.15054666 8.35714286,1.77453879 7.85714286,2.15054666 L3.78571429,6.00820648 Z"></path>`;

const icons = {
  airplay,
  "captions-off": captionsOff,
  "captions-on": captionsOn,
  download,
  "enter-fullscreen": enterFullscreen,
  "exit-fullscreen": exitFullscreen,
  "fast-forward": fastForward,
  muted,
  pause,
  "enter-pip": pip,
  "exit-pip": pip,
  play,
  restart,
  rewind,
  settings,
  volume
};

var icons$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  icons: icons
});

export { ARIAKeyShortcuts, AudioTrackList, LibASSTextRenderer, LocalMediaStorage, MEDIA_KEY_SHORTCUTS, MediaControls, MediaRemoteControl, PlyrLayout$1 as PlyrLayout, TextRenderers, TextTrack, TextTrackList, TimeRange, VideoQualityList, VidstackPlayer, VidstackPlayerLayout, boundTime, findActiveCue, getTimeRangesEnd, getTimeRangesStart, isCueActive, isTrackCaptionKind, isVideoQualitySrc, mediaContext, mediaState, normalizeTimeIntervals, parseJSONCaptionsFile, softResetMediaState, sortVideoQualities, updateTimeIntervals, watchActiveTextTrack, watchCueTextChange };
