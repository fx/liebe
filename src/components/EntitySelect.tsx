import { Autocomplete, TextField } from '@mui/material';
import styled from '@mui/styled-engine';
import { isEmpty, isEqual } from 'lodash';
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
  React.memo(
    function EntitySelect({ entities, value, onChange }: EntitySelectProps) {
      const entityIds = entities?.map((entity) => entity.entity_id);
      const options = useMemo(
        () =>
          isEmpty(entityIds)
            ? []
            : entityIds?.map((id) => ({
                id,
                label: id,
              })),
        [entityIds],
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
    (prevProps, nextProps) => {
      return isEqual(prevProps, nextProps);
    },
  ),
)``;
