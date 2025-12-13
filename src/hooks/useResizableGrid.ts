/**
 * Resizable Grid Hook
 * 
 * Provides drag-to-resize functionality for grid items.
 * Allows users to adjust the size of terminals in grid view.
 */

import { useState, useCallback, useRef, useEffect } from "react";

interface GridSize {
    cols: number;
    rows: number;
}

interface UseResizableGridOptions {
    minCellWidth?: number;
    minCellHeight?: number;
    defaultCols?: number;
}

export function useResizableGrid(
    itemCount: number,
    options: UseResizableGridOptions = {}
) {
    const {
        minCellWidth = 350,
        minCellHeight = 250,
        defaultCols = 2,
    } = options;

    const containerRef = useRef<HTMLDivElement | null>(null);
    const [gridSize, setGridSize] = useState<GridSize>({ cols: defaultCols, rows: 1 });
    const [cellSizes, setCellSizes] = useState<number[]>([]);

    // Calculate optimal grid layout based on container size and item count
    const calculateLayout = useCallback(() => {
        if (!containerRef.current || itemCount === 0) return;

        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;

        // Calculate how many columns can fit
        const maxCols = Math.max(1, Math.floor(containerWidth / minCellWidth));
        const optimalCols = Math.min(maxCols, itemCount);
        const rows = Math.ceil(itemCount / optimalCols);

        // Check if we need fewer columns based on height constraints
        const cellHeight = containerHeight / rows;
        let finalCols = optimalCols;
        if (cellHeight < minCellHeight && rows > 1) {
            finalCols = Math.max(1, optimalCols - 1);
        }

        setGridSize({ cols: finalCols, rows: Math.ceil(itemCount / finalCols) });

        // Initialize cell sizes if needed
        if (cellSizes.length !== itemCount) {
            setCellSizes(new Array(itemCount).fill(1));
        }
    }, [itemCount, minCellWidth, minCellHeight, cellSizes.length]);

    // Recalculate on resize
    useEffect(() => {
        calculateLayout();

        const resizeObserver = new ResizeObserver(() => {
            calculateLayout();
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => resizeObserver.disconnect();
    }, [calculateLayout]);

    // Recalculate when item count changes
    useEffect(() => {
        calculateLayout();
    }, [itemCount, calculateLayout]);

    const getGridStyle = useCallback((): React.CSSProperties => {
        return {
            display: "grid",
            gridTemplateColumns: `repeat(${gridSize.cols}, 1fr)`,
            gridTemplateRows: `repeat(${gridSize.rows}, 1fr)`,
            gap: "2px",
            width: "100%",
            height: "100%",
        };
    }, [gridSize]);

    const incrementCols = useCallback(() => {
        if (gridSize.cols < itemCount) {
            setGridSize(prev => ({
                cols: prev.cols + 1,
                rows: Math.ceil(itemCount / (prev.cols + 1)),
            }));
        }
    }, [gridSize.cols, itemCount]);

    const decrementCols = useCallback(() => {
        if (gridSize.cols > 1) {
            setGridSize(prev => ({
                cols: prev.cols - 1,
                rows: Math.ceil(itemCount / (prev.cols - 1)),
            }));
        }
    }, [gridSize.cols, itemCount]);

    return {
        containerRef,
        gridSize,
        getGridStyle,
        incrementCols,
        decrementCols,
    };
}
