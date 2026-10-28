import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing } from '../../theme';

const logo = require('../../../assets/logoCoagro.png');

export default function ScreenHeader({ eyebrow = 'COAGRO GANADERÍA', title, onBack, onMenu }) {
  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.iconButton}>
        <Feather name="arrow-left" size={24} color={colors.text} />
      </Pressable>

      <View style={styles.titles}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>

      <Pressable onPress={onMenu} hitSlop={10} style={styles.iconButton}>
        <Feather name="more-vertical" size={22} color={colors.text} />
      </Pressable>
      <Image source={logo} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  iconButton: {
    padding: spacing.xs,
  },
  titles: {
    flex: 1,
    marginLeft: spacing.xs,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  logo: {
    width: 36,
    height: 36,
    marginLeft: spacing.xs,
  },
});
