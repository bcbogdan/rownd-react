import { useEffect, useRef } from 'react';
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
  authLevel: TRowndContext['auth_level']
): boolean {
  return (
    userType === 'new_user' ||
    (userType === 'existing_user' && authLevel === 'instant')
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
  const pendingMigrationRef = useRef(false);
  const supertokensAppInfoRef = useRef(normalizeSuperTokensAppInfo(appInfo));

  const flushPendingMigration = () => {
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
    syncUserToSuperTokens(currentAccessToken, appInfo);
  };

  useEffect(() => {
    accessTokenRef.current = accessToken;
    authLevelRef.current = authLevel;
    flushPendingMigration();
  }, [accessToken, authLevel]);

  useEffect(() => {
    supertokensAppInfoRef.current = normalizeSuperTokensAppInfo(appInfo);
    flushPendingMigration();
  }, [appInfo?.appName, appInfo?.apiDomain, appInfo?.apiBasePath]);

  useEffect(() => {
    const handleSignInCompleted = (event: Event) => {
      const userType = getSignInCompletedUserType(event);

      if (!shouldMigrateSignIn(userType, authLevelRef.current)) {
        return;
      }

      pendingMigrationRef.current = true;
      flushPendingMigration();
    };

    events.addEventListener('sign_in_completed', handleSignInCompleted);

    return () => {
      events.removeEventListener('sign_in_completed', handleSignInCompleted);
    };
  }, [events]);
}
