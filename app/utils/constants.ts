import { VerificationTypes } from '~/routes/_auth+/verify'

export const onboardingEmailSessionKey = 'onboardingEmail'
export const resetPasswordUsernameSessionKey = 'resetPasswordUsername'
export const newEmailAddressSessionKey = 'newEmailAddress'
export const twoFAVerifyVerificationType = '2fa-verify'
export const twoFAVerificationType = '2fa' satisfies VerificationTypes

export const codeQueryParam = 'code'
export const targetQueryParam = 'target'
export const typeQueryParam = 'type'
export const redirectToQueryParam = 'redirectTo'

export const unverifiedSessionIdKey = 'unverified-session-id'
export const rememberMeSessionKey = 'remember-me'
export const verifiedTimeKey = 'verified-time'

// AUTH_SETTINGS have been moved to SystemSettings (database-configurable)
// Use getSetting() from '~/utils/settings.server' instead:
// - SettingKeys.AUTH_MAX_LOGIN_ATTEMPTS
// - SettingKeys.AUTH_LOCKOUT_DURATION_MINUTES
// - SettingKeys.AUTH_AUTO_RESET_AFTER_MINUTES
// - SettingKeys.AUTH_MAX_LOCK_COUNT
