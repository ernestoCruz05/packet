/**
 * SplitPane Component
 * 
 * A recursive component that renders split pane layouts.
 * Each pane can either contain a terminal or be split into child panes.
 * Supports draggable dividers for resizing.
 */

import { useRef, useCallback, useState } from "react";
import { SplitPane as SplitPaneType } from "../types/terminal";
import { TerminalPanel } from "./TerminalPanel";
import { useTerminals } from "../context/TerminalContext";

interface SplitPaneProps {
    pane: SplitPaneType;
    onResize: (paneId: string, newSize: number) => void;
    onDrop: (paneId: string, position: "left" | "right" | "top" | "bottom", sessionId: string) => void;
    isActive: boolean;
}

/**
 * Drop zone indicator for drag and drop
 */
function DropZone({
    position,
    visible,
    onDrop
}: {
    position: "left" | "right" | "top" | "bottom";
    visible: boolean;
    onDrop: () => void;
}) {
    if (!visible) return null;

    const positionClasses: Record<string, string> = {
        left: "drop-zone-left",
        right: "drop-zone-right",
        top: "drop-zone-top",
        bottom: "drop-zone-bottom",
    };

    return (
        <div
            className={`drop-zone ${positionClasses[position]}`}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(); }}
        >
            <div className="drop-zone-indicator" />
        </div>
    );
}

/**
 * Resizable divider between split panes
 */
function Divider({
    direction,
    onDrag
}: {
    direction: "horizontal" | "vertical";
    onDrag: (delta: number) => void;
}) {
    const [isDragging, setIsDragging] = useState(false);
    const startPosRef = useRef(0);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        startPosRef.current = direction === "horizontal" ? e.clientX : e.clientY;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const currentPos = direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
            const delta = currentPos - startPosRef.current;
            startPosRef.current = currentPos;
            onDrag(delta);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [direction, onDrag]);

    return (
        <div
            className={`split-divider ${direction} ${isDragging ? "dragging" : ""}`}
            onMouseDown={handleMouseDown}
        />
    );
}

export function SplitPaneContainer({ pane, onResize, onDrop, isActive }: SplitPaneProps) {
    const { sessions } = useTerminals();
    const containerRef = useRef<HTMLDivElement>(null);
    const [dropTarget, setDropTarget] = useState<"left" | "right" | "top" | "bottom" | null>(null);
    const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null);

    // Handle drag over to show drop zones
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const xRatio = x / rect.width;
        const yRatio = y / rect.height;

        // Determine which edge is closest
        const threshold = 0.25;
        if (xRatio < threshold) setDropTarget("left");
        else if (xRatio > 1 - threshold) setDropTarget("right");
        else if (yRatio < threshold) setDropTarget("top");
        else if (yRatio > 1 - threshold) setDropTarget("bottom");
        else setDropTarget(null);

        // Get dragged session ID from dataTransfer
        const sessionId = e.dataTransfer.getData("sessionId");
        if (sessionId) setDraggedSessionId(sessionId);
    }, []);

    const handleDragLeave = useCallback(() => {
        setDropTarget(null);
        setDraggedSessionId(null);
    }, []);

    const handleDropAtPosition = useCallback((position: "left" | "right" | "top" | "bottom") => {
        if (draggedSessionId) {
            onDrop(pane.id, position, draggedSessionId);
        }
        setDropTarget(null);
        setDraggedSessionId(null);
    }, [draggedSessionId, onDrop, pane.id]);

    // If this is a leaf pane with a session, render the terminal
    if (pane.sessionId) {
        const session = sessions.find(s => s.id === pane.sessionId);
        if (!session) {
            return <div className="pane-empty">Session not found</div>;
        }

        return (
            <div
                ref={containerRef}
                className="split-pane leaf"
                style={{ flex: pane.size }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                <TerminalPanel session={session} isActive={isActive} />
                <DropZone position="left" visible={dropTarget === "left"} onDrop={() => handleDropAtPosition("left")} />
                <DropZone position="right" visible={dropTarget === "right"} onDrop={() => handleDropAtPosition("right")} />
                <DropZone position="top" visible={dropTarget === "top"} onDrop={() => handleDropAtPosition("top")} />
                <DropZone position="bottom" visible={dropTarget === "bottom"} onDrop={() => handleDropAtPosition("bottom")} />
            </div>
        );
    }

    // If this is a split pane, render children with dividers
    if (pane.children && pane.children.length > 0) {
        const isHorizontal = pane.direction === "horizontal";

        return (
            <div
                className={`split-pane container ${isHorizontal ? "horizontal" : "vertical"}`}
                style={{ flex: pane.size }}
            >
                {pane.children.map((child, index) => (
                    <div key={child.id} className="split-pane-wrapper" style={{ flex: child.size }}>
                        <SplitPaneContainer
                            pane={child}
                            onResize={onResize}
                            onDrop={onDrop}
                            isActive={isActive}
                        />
                        {index < pane.children!.length - 1 && (
                            <Divider
                                direction={isHorizontal ? "horizontal" : "vertical"}
                                onDrag={(delta) => {
                                    // Calculate new sizes based on delta
                                    const containerSize = containerRef.current?.[isHorizontal ? "offsetWidth" : "offsetHeight"] || 1;
                                    const deltaRatio = delta / containerSize;
                                    onResize(child.id, Math.max(0.1, Math.min(0.9, child.size + deltaRatio)));
                                }}
                            />
                        )}
                    </div>
                ))}
            </div>
        );
    }

    // Empty pane
    return (
        <div
            ref={containerRef}
            className="split-pane empty"
            style={{ flex: pane.size }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
        >
            <div className="pane-empty">
                <span>Drop a terminal here</span>
            </div>
            <DropZone position="left" visible={dropTarget === "left"} onDrop={() => handleDropAtPosition("left")} />
            <DropZone position="right" visible={dropTarget === "right"} onDrop={() => handleDropAtPosition("right")} />
            <DropZone position="top" visible={dropTarget === "top"} onDrop={() => handleDropAtPosition("top")} />
            <DropZone position="bottom" visible={dropTarget === "bottom"} onDrop={() => handleDropAtPosition("bottom")} />
        </div>
    );
}
