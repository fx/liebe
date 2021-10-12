// Inspired by https://github.com/react-grid-layout/react-grid-layout/issues/399#issuecomment-258494575
import { invert, isEmpty } from 'lodash';
import React, { useCallback, useState } from 'react';
import type { Responsive, ResponsiveProps } from 'react-grid-layout';

function findBreakpoint(breakpoints: any, width: number) {
  if (!breakpoints) return;
  const closest: any = Object.values(breakpoints).sort(
    (a: any, b: any) => Math.abs(width - a) - Math.abs(width - b),
  )[0];
  return invert(breakpoints)[closest];
}

export const SquareWidthProvider =
  (ComposedComponent: typeof Responsive) =>
  (
    props: ResponsiveProps | (Readonly<ResponsiveProps> & { children: any }),
  ) => {
    const { margin, breakpoints, cols } = props;
    const [rowHeight, setRowHeight] = useState(0);
    const updateRowHeight = useCallback((ref) => {
      if (!ref) return;
      new ResizeObserver((entries) => {
        if (isEmpty(entries)) return;

        const {
          contentRect: { width },
        } = entries[0];

        const currentBreakpoint = findBreakpoint(breakpoints, width);

        if (currentBreakpoint)
          setRowHeight(
            (width -
              (margin ? margin[0] : 10) * (cols[currentBreakpoint] + 1)) /
              cols[currentBreakpoint],
          );
      }).observe(ref);
    }, []);

    return (
      <div ref={updateRowHeight}>
        <ComposedComponent {...props} rowHeight={rowHeight} />
      </div>
    );
  };
