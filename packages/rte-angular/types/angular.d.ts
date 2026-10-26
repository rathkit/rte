// The small part of Angular this package uses, declared so the repo needs no copy of Angular. Apps get the real types from Angular itself.
declare module "@angular/core" {
  export interface Signal<T> { (): T }
  export interface WritableSignal<T> extends Signal<T> { set(value: T): void; asReadonly(): Signal<T> }
  export function signal<T>(initial: T): WritableSignal<T>;
  export function effect(fn: (onCleanup: (cleanup: () => void) => void) => void): unknown;
  export class ElementRef<T = unknown> { readonly nativeElement: T }
  export class NgZone { runOutsideAngular<T>(fn: () => T): T; run<T>(fn: () => T): T }
  export class EventEmitter<T> { emit(value: T): void; subscribe(next: (value: T) => void): { unsubscribe(): void } }
  export function inject<T>(token: abstract new (...args: never[]) => T, options?: { self?: boolean; optional?: boolean }): T;
  export const ɵɵFactoryTarget: { readonly Directive: number };
  export function ɵɵngDeclareFactory(declaration: Record<string, unknown>): unknown;
  export function ɵɵngDeclareDirective(declaration: Record<string, unknown>): unknown;
}
declare module "@angular/forms" {
  export const NG_VALUE_ACCESSOR: unknown;
}
