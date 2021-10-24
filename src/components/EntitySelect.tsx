import { Autocomplete, TextField } from '@mui/material';
import styled from '@mui/styled-engine';
import { isEmpty } from 'lodash';
import React, { useMemo } from 'react';

interface EntitySelectProps {
  value?: string;
  onChange?: any;
  entities?: EntityState[];
}

const renderInput = (params) => (
  <TextField {...params} placeholder="Select Entity" />
);

export const EntitySelect = styled(
  ({ entities, value, onChange }: EntitySelectProps) => {
    const options = useMemo(
      () =>
        isEmpty(entities)
          ? []
          : entities?.map((entity) => ({
              id: entity.entity_id,
              label: entity.entity_id,
            })),
      [JSON.stringify(entities)],
    );

    return (
      <Autocomplete
        disablePortal
        options={options}
        value={value ? { id: value, label: value } : undefined}
        renderInput={renderInput}
        onChange={(_e, selected) => onChange(selected?.id)}
        isOptionEqualToValue={(option, value) => option.id == value.id}
      />
    );
  },
)``;
