import { formatClock } from '@screentime/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { haptic } from '../lib/haptics';
import { useTheme } from './theme';

/** Simple "− 22:00 +" picker in 15-minute steps (minutes after midnight). */
export function TimeStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const t = useTheme();
  const step = (delta: number) => {
    haptic.tap();
    onChange((value + delta + 1440) % 1440);
  };
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <View style={styles.controls}>
        <Pressable accessibilityLabel={`${label} earlier`} onPress={() => step(-15)} style={[styles.btn, { borderColor: t.border }]}>
          <Text style={[styles.btnText, { color: t.text }]}>−</Text>
        </Pressable>
        <Text style={[styles.value, { color: t.text }]}>{formatClock(value)}</Text>
        <Pressable accessibilityLabel={`${label} later`} onPress={() => step(15)} style={[styles.btn, { borderColor: t.border }]}>
          <Text style={[styles.btnText, { color: t.text }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 15, fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 22, fontWeight: '600' },
  value: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'center' },
});
