"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";

interface CatchProps { children: ReactNode; resetKey: string; fallback: (retry: () => void) => ReactNode }
interface CatchState { failed: boolean }

/** Catches a mistake while drawing a step. The workbook and every correction live in the engine, outside the part of the page that failed. */
class Catch extends Component<CatchProps, CatchState> {
  state: CatchState = { failed: false };
  static getDerivedStateFromError(): CatchState { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Collateral step failed to draw", error.message, info.componentStack?.split("\n")[1]?.trim()); }
  componentDidUpdate(previous: CatchProps) { if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false }); }
  render() { return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children; }
}

/** Leaving the step (a new `resetKey`) tries again by itself; the button does it on demand. */
export function CollateralBoundary({ resetKey, children }: { resetKey: string; children: ReactNode }) {
  const { t: uiText } = useWorkspaceI18n();
  return <Catch resetKey={resetKey} fallback={retry => <div className="cr-alert" role="alert">
    <span>{uiText("This step could not be drawn. Your workbook and your corrections are safe: nothing was lost.")}</span>
    <button type="button" className="ui-button" data-variant="secondary" data-size="sm" onClick={retry}><span className="ui-button__label">{uiText("Try again")}</span></button>
  </div>}>{children}</Catch>;
}
