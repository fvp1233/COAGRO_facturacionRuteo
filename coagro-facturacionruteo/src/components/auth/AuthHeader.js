import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../theme';

const logo = require('../../../assets/logoCoagro.png');

export default function AuthHeader({
  title,
  subtitle,
  topInset = 0,
  logoFramed = false,
  onLogoLongPress,
}) {
  const logoNode = logoFramed ? (
    <View style={styles.logoFrame}>
      <Image source={logo} style={styles.logo} resizeMode="contain" />
    </View>
  ) : (
    <Image source={logo} style={styles.logo} resizeMode="contain" />
  );

  return (
    <View style={[styles.container, { paddingTop: topInset + spacing.lg }]}>
      {/* Decorative blobs */}
      <View style={[styles.blob, styles.blobTopLeft]} />
      <View style={[styles.blob, styles.blobRight]} />

      <View style={styles.content}>
        <View style={styles.texts}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {onLogoLongPress ? (
          <Pressable onLongPress={onLogoLongPress} delayLongPress={1500}>
            {logoNode}
          </Pressable>
        ) : (
          logoNode
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl + spacing.xl,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    backgroundColor: colors.primaryPressed,
    borderRadius: 999,
    opacity: 0.6,
  },
  blobTopLeft: {
    width: 260,
    height: 260,
    top: -120,
    left: -90,
  },
  blobRight: {
    width: 220,
    height: 220,
    top: 40,
    right: -110,
    opacity: 0.35,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  texts: {
    flex: 1,
    paddingRight: spacing.md,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.onPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.onPrimary,
  },
  logo: {
    width: 84,
    height: 84,
  },
  logoFrame: {
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
});
