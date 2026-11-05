import { useState } from 'react';
import { DeviceActivitySelectionSheetView } from 'react-native-device-activity';
import { ScreenTime } from '../screentime';
import { Body, Button, Card } from './ui';

/**
 * Lets the user choose which apps/categories/sites a limit covers, using Apple's
 * FamilyActivityPicker. The selection is an opaque token: we can't read app names,
 * only counts, and it never leaves the device.
 */
export function AppPicker({ value, onChange }: { value: string | null; onChange: (token: string | null) => void }) {
  const [open, setOpen] = useState(false);

  if (!ScreenTime.isAvailable) {
    return (
      <Card>
        <Body muted>App selection needs a development build on an iPhone with Screen Time access.</Body>
      </Card>
    );
  }

  return (
    <Card>
      <Body style={{ fontWeight: '700' }}>{ScreenTime.describeSelection(value)}</Body>
      <Button title={value ? 'Change apps' : 'Choose apps to limit'} variant="secondary" onPress={() => setOpen(true)} />
      {open && (
        // Invisible anchor: the native side presents the system picker sheet.
        <DeviceActivitySelectionSheetView
          style={{ width: 1, height: 1, position: 'absolute' }}
          familyActivitySelection={value}
          onSelectionChange={(e) => onChange(e.nativeEvent.familyActivitySelection)}
          onDismissRequest={() => setOpen(false)}
          headerText="Choose what this limit covers"
        />
      )}
    </Card>
  );
}
