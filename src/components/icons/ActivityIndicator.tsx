import React from 'react';
import { motion } from 'framer-motion';
import styled from '@mui/styled-engine';

interface ActivityIndicatorProps {
  className?: string;
  active?: boolean;
  color?: string;
}

export const ActivityIndicator = styled(
  ({ className, active, color: backgroundColor }: ActivityIndicatorProps) => {
    const boop = active ? (
      <motion.div
        style={{ backgroundColor }}
        className="activity-inner"
        animate={{ scale: [0.8, 1.75], opacity: [1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 0.25 }}
      />
    ) : undefined;

    return (
      <div className={className}>
        <motion.div
          style={{ backgroundColor }}
          className="activity-outer"
          animate={{}}
        >
          {boop}
        </motion.div>
      </div>
    );
  },
)`
  display: flex;
  align-items: center;

  .activity-outer,
  .activity-inner {
    width: 10px;
    height: 10px;
    border-radius: 100%;
  }

  .activity-inner {
    width: 10px;
    height: 10px;
    box-shadow: 0 0 3px red;
  }
`;

ActivityIndicator.defaultProps = {
  active: true,
  color: 'red',
};
