import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import AuthHeader from './AuthHeader';
import LinkText from '../ui/LinkText';
import { colors, radius, spacing } from '../../theme';

export default function AuthLayout({
  headerTitle,
  headerSubtitle,
  logoFramed = false,
  title,
  subtitle,
  footerText,
  footerLink,
  onFooterPress,
  onLogoLongPress,
  children,
}) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <AuthHeader
          topInset={insets.top}
          title={headerTitle}
          subtitle={headerSubtitle}
          logoFramed={logoFramed}
          onLogoLongPress={onLogoLongPress}
        />

        <View style={[styles.card, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitles}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <View style={styles.badge}>
              <MaterialCommunityIcons name="shield-check-outline" size={20} color={colors.primary} />
            </View>
          </View>

          {children}

          {footerText || footerLink ? (
            <View style={styles.footer}>
              {footerText ? <Text style={styles.footerText}>{footerText}</Text> : null}
              {footerLink ? <LinkText title={footerLink} onPress={onFooterPress} chevron /> : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  scroll: {
    flexGrow: 1,
  },
  card: {
    flex: 1,
    marginTop: -spacing.xl,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  cardTitles: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerText: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
