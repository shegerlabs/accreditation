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

export const AUTH_SETTINGS = {
	MAX_LOGIN_ATTEMPTS: 5,
	LOCKOUT_DURATION: 30, // minutes
	AUTO_RESET_AFTER: 60, // minutes - reset failed attempts after this duration
	MAX_LOCK_COUNT: 3, // maximum number of times an account can be locked before requiring manual intervention
}
