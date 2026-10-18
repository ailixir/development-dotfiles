import React, { useEffect, useState } from 'react';
import { Box, Button, ListItemText, ListSubheader, Menu, MenuItem } from '@mui/material';
import secretsApi from '@/services/api/secretsApi';
import { CreateSecretDialog } from '@/components/studio/SecretInput';
import {
  CAPABILITIES_UNKNOWN,
  vaultSecretsEnabled,
  type StudioCapabilitiesState,
} from '@/utils/config/studioCapabilities';
import {
  isReferenceName,
  secretFailureText,
  secretToken,
  secretsUnavailableText,
  varToken,
} from './referenceTokens';

/**
 * The reference insert menu (STUDIO-OBS-008 AC-5(b), plan "L4"): the author picks a declared
 * variable or a stored secret and the host inserts its token at the step's selection, so nobody
 * types `<var NAME>` or `<secret ID>` by hand. There is no autocomplete on `<` (post-GA).
 *
 * - Variables come from the host's declared plain variables.
 * - Secrets are offered only when the server capability says a Vault provider is configured
 *   (`useStudioCapabilities`, P1). Their names are read from `listTestSecrets` each time the menu
 *   opens. The inserted ID is that Vault name, the `secretId` a declaration must carry (D-8).
 * - "New secret…" opens the existing create dialog; only `{name, version, allowedOrigins}` comes
 *   back from it, and the new name is inserted.
 *
 * The component never holds, renders or passes on a secret value.
 */

/**
 * What the host inserts. For a secret the host also makes sure the test declares a `secretRef`
 * whose `secretId` is `name`, because a `<secret ID>` token resolves only against a declaration
 * with that `secretId` (D-8). The picker never writes a declaration itself.
 */
export interface InsertedReference {
  kind: 'var' | 'secret';
  /** The variable's name, or the secret's Vault name (`secretId`). */
  name: string;
  /** Exactly what goes into the step: `<var NAME>` or `<secret ID>`. */
  token: string;
}

export interface ReferencePickerProps {
  /** The persisted Studio test. `null` (not saved yet) offers no secrets and sends no request. */
  testId: string | null;
  /** The test's declared plain variable names, in the host's order. */
  variableNames: readonly string[];
  /** The host's `useStudioCapabilities(testId)` answer. */
  capabilities: StudioCapabilitiesState;
  /** The host inserts `reference.token` at the step's selection (see `insertAtSelection`). */
  onInsert: (reference: InsertedReference) => void;
  disabled?: boolean;
}

/** The names read for one test. A list read for another test id is never shown. */
type SecretNames =
  | { status: 'loading' }
  | { status: 'ready'; testId: string; names: string[] }
  | { status: 'failed'; testId: string; message: string };

const uniqueReferenceNames = (names: readonly string[]): string[] =>
  [...new Set(names)].filter(isReferenceName);

const ReferencePicker: React.FC<ReferencePickerProps> = ({
  testId,
  variableNames,
  capabilities,
  onInsert,
  disabled = false,
}) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [secretNames, setSecretNames] = useState<SecretNames>({ status: 'loading' });
  const [createOpen, setCreateOpen] = useState(false);

  const secretsOn = testId !== null && vaultSecretsEnabled(capabilities);
  const secretsNotice = secretsUnavailableText(testId === null ? CAPABILITIES_UNKNOWN : capabilities);
  const menuOpen = anchor !== null;

  // The create dialog exists only while secrets are on. If they turn off while it is open, it is
  // closed for good, so it never reopens by itself when the capability comes back.
  useEffect(() => {
    if (!secretsOn) setCreateOpen(false);
  }, [secretsOn]);

  // Names are read fresh every time the menu opens, and again if the test or the capability
  // changes while it is open. Nothing is read while it is closed or while secrets are off.
  useEffect(() => {
    if (!menuOpen || !secretsOn || testId === null) return undefined;
    let active = true;
    setSecretNames({ status: 'loading' });
    secretsApi.listSecrets(testId).then(
      (res) => {
        if (active) {
          setSecretNames({
            status: 'ready',
            testId,
            names: uniqueReferenceNames((res.data ?? []).map((secret) => secret.name)),
          });
        }
      },
      (failure: unknown) => {
        if (active) {
          setSecretNames({ status: 'failed', testId, message: secretFailureText(failure, 'Could not load secrets') });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [menuOpen, secretsOn, testId]);

  const closeMenu = () => {
    setAnchor(null);
    setSecretNames({ status: 'loading' });
  };

  const insert = (reference: InsertedReference) => {
    closeMenu();
    onInsert(reference);
  };

  const variables = uniqueReferenceNames(variableNames);

  const secretItems = (): React.ReactNode[] => {
    if (!secretsOn) {
      return [
        <MenuItem key="secrets-off" disabled>
          {secretsNotice}
        </MenuItem>,
      ];
    }
    const items: React.ReactNode[] = [];
    if (secretNames.status === 'loading' || secretNames.testId !== testId) {
      items.push(
        <MenuItem key="secrets-loading" disabled>
          Loading secrets…
        </MenuItem>,
      );
    } else if (secretNames.status === 'failed') {
      items.push(
        <MenuItem key="secrets-failed" disabled>
          {secretNames.message}
        </MenuItem>,
      );
    } else if (secretNames.names.length === 0) {
      items.push(
        <MenuItem key="secrets-none" disabled>
          No secrets stored for this test yet.
        </MenuItem>,
      );
    } else {
      for (const name of secretNames.names) {
        const token = secretToken(name);
        items.push(
          <MenuItem key={`secret:${name}`} onClick={() => insert({ kind: 'secret', name, token })}>
            <ListItemText primary={name} secondary={token} />
          </MenuItem>,
        );
      }
    }
    items.push(
      <MenuItem
        key="secret-new"
        onClick={() => {
          closeMenu();
          setCreateOpen(true);
        }}
      >
        New secret…
      </MenuItem>,
    );
    return items;
  };

  return (
    <Box>
      <Button size="small" variant="outlined" onClick={(event) => setAnchor(event.currentTarget)} disabled={disabled}>
        Insert reference
      </Button>
      <Menu anchorEl={anchor} open={menuOpen} onClose={closeMenu}>
        <ListSubheader>Variables</ListSubheader>
        {variables.length === 0 ? (
          <MenuItem disabled>No variables yet. Add one in Variables.</MenuItem>
        ) : (
          variables.map((name) => {
            const token = varToken(name);
            return (
              <MenuItem key={`var:${name}`} onClick={() => insert({ kind: 'var', name, token })}>
                <ListItemText primary={name} secondary={token} />
              </MenuItem>
            );
          })
        )}
        <ListSubheader>Secrets</ListSubheader>
        {secretItems()}
      </Menu>
      {secretsOn && (
        <CreateSecretDialog
          open={createOpen}
          testId={testId}
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            if (isReferenceName(created.name)) {
              onInsert({ kind: 'secret', name: created.name, token: secretToken(created.name) });
            }
          }}
        />
      )}
    </Box>
  );
};

export default ReferencePicker;
