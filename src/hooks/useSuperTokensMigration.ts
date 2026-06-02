import { useCallback, useEffect, useRef } from 'react';
import { RowndProviderProps } from '../context/RowndContext';
import { TRowndContext } from '../context/types';
import {
  normalizeSuperTokensAppInfo,
  syncUserToSuperTokens,
} from '../utils/supertokens-sync';

type UseSuperTokensMigrationProps = {
  accessToken: string | null;
  authLevel: TRowndContext['auth_level'];
  events: TRowndContext['events'];
  supertokens?: RowndProviderProps['supertokens'];
};

function getSignInCompletedUserType(event: Event): unknown {
  if (typeof CustomEvent === 'undefined' || !(event instanceof CustomEvent)) {
    return undefined;
  }

  const detail = event.detail;
  if (!detail || typeof detail !== 'object') {
    return undefined;
  }

  return (detail as { user_type?: unknown }).user_type;
}

function shouldMigrateSignIn(
  userType: unknown,
  hasSeenInstantSession: boolean
): boolean {
  return (
    userType === 'new_user' ||
    (userType === 'existing_user' && hasSeenInstantSession)
  );
}

export function useSuperTokensMigration({
  accessToken,
  authLevel,
  events,
  supertokens,
}: UseSuperTokensMigrationProps): void {
  const appInfo = supertokens?.appInfo;
  const accessTokenRef = useRef<string | null>(accessToken);
  const authLevelRef = useRef<TRowndContext['auth_level']>(authLevel);
  const hasSeenInstantSessionRef = useRef(false);
  const pendingMigrationRef = useRef(false);
  const supertokensAppInfoRef = useRef(normalizeSuperTokensAppInfo(appInfo));

  const flushPendingMigration = useCallback(() => {
    const currentAccessToken = accessTokenRef.current;
    const currentAuthLevel = authLevelRef.current;
    const appInfo = supertokensAppInfoRef.current;

    if (
      !pendingMigrationRef.current ||
      !currentAccessToken ||
      !appInfo ||
      currentAuthLevel === 'instant'
    ) {
      return;
    }

    pendingMigrationRef.current = false;
    void syncUserToSuperTokens(currentAccessToken, appInfo);
  }, []);

  useEffect(() => {
    const hadAccessToken = !!accessTokenRef.current;

    accessTokenRef.current = accessToken;
    authLevelRef.current = authLevel;

    if (hadAccessToken && !accessToken) {
      hasSeenInstantSessionRef.current = false;
      pendingMigrationRef.current = false;
    }

    if (accessToken && authLevel === 'instant') {
      hasSeenInstantSessionRef.current = true;
    }

    flushPendingMigration();
  }, [accessToken, authLevel, flushPendingMigration]);

  useEffect(() => {
    supertokensAppInfoRef.current = normalizeSuperTokensAppInfo(appInfo);
    flushPendingMigration();
  }, [
    appInfo?.appName,
    appInfo?.apiDomain,
    appInfo?.apiBasePath,
    flushPendingMigration,
  ]);

  useEffect(() => {
    const handleSignInCompleted = (event: Event) => {
      const userType = getSignInCompletedUserType(event);

      if (!shouldMigrateSignIn(userType, hasSeenInstantSessionRef.current)) {
        return;
      }

      pendingMigrationRef.current = true;
      if (userType === 'existing_user') {
        hasSeenInstantSessionRef.current = false;
      }

      flushPendingMigration();
    };

    events.addEventListener('sign_in_completed', handleSignInCompleted);

    return () => {
      events.removeEventListener('sign_in_completed', handleSignInCompleted);
    };
  }, [events, flushPendingMigration]);
}
