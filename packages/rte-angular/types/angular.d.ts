// The small part of Angular this package uses, declared so the repo needs no copy of Angular. Apps get the real types from Angular itself.
declare module "@angular/core" {
  export interface Signal<T> { (): T }
  export interface WritableSignal<T> extends Signal<T> { set(value: T): void; asReadonly(): Signal<T> }
  export function signal<T>(initial: T): WritableSignal<T>;
  export function effect(fn: (onCleanup: (cleanup: () => void) => void) => void): unknown;
  export class ElementRef<T = unknown> { readonly nativeElement: T }
  export class NgZone { runOutsideAngular<T>(fn: () => T): T; run<T>(fn: () => T): T }
  export class EventEmitter<T> { emit(value: T): void; subscribe(next: (value: T) => void): { unsubscribe(): void } }
  export class InjectionToken<T> { constructor(description: string); readonly ɵtype?: T }
  /** Says which platform the app runs on: "browser" in a browser, "server" when Angular renders on a server. */
  export const PLATFORM_ID: InjectionToken<unknown>;
  export function inject<T>(token: InjectionToken<T>): T;
  export function inject<T>(token: abstract new (...args: never[]) => T, options?: { self?: boolean; optional?: boolean }): T;
  export const ɵɵFactoryTarget: { readonly Directive: number };
  // The two types an Angular build reads from the .d.ts file to know what a directive is and what it takes.
  export type ɵɵFactoryDeclaration<T, CtorDependencies extends readonly unknown[] | never> = unknown;
  export type ɵɵDirectiveDeclaration<T, Selector extends string, ExportAs extends readonly string[], InputMap extends object, OutputMap extends object, Queries extends readonly unknown[], NgContentSelectors extends readonly string[], IsStandalone extends boolean = false, HostDirectives = never, IsSignal extends boolean = false> = unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function ɵɵngDeclareFactory(declaration: Record<string, unknown>): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function ɵɵngDeclareDirective(declaration: Record<string, unknown>): any;
}
declare module "@angular/forms" {
  export const NG_VALUE_ACCESSOR: unknown;
}
