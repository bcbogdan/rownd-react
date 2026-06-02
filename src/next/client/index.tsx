'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  HubListenerProps,
  RowndProviderProps,
} from '../../context/RowndContext';
import { store } from './store';
import HubScriptInjector from '../../context/HubScriptInjector/HubScriptInjector';
import useHub from '../../hooks/useHub';
import { TRowndContext } from '../../context/types';
import useCookie from '../../ssr/hooks/useCookie';
import { useRownd } from './useRownd';
import { getOnAuthenticatedListeners } from '../../utils/listeners';
import { useSuperTokensMigration } from '../../hooks/useSuperTokensMigration';

const Client: React.FC<Omit<RowndProviderProps, 'children'>> = (props) => {
  const { setInitialHubState, hubListenerCb } = useHub();
  const [hasCookieSignedIn, setHasCookieSignedIn] = useState(false);

  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    store.setState(setInitialHubState());
    hasInitialized.current = true;
  }, []);

  const setState: (
    partial:
      | Partial<TRowndContext>
      | ((state: TRowndContext) => Partial<TRowndContext>)
  ) => void = useCallback(
    (partial) => {
      store.setState(partial);
    },
    [store]
  );

  const {
    access_token,
    auth_level,
    events,
    is_initializing,
    is_authenticated,
    user,
  } = useRownd();
  const { cookieSignIn, cookieSignOut } = useCookie(useRownd);
  useSuperTokensMigration({
    accessToken: access_token,
    authLevel: auth_level,
    events,
    supertokens: props.supertokens,
  });

  // Listen for access_token changes to determine when to sign(In/Out) cookies and state.
  const prevAccessToken = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (is_initializing || prevAccessToken.current === access_token) return;

    prevAccessToken.current = access_token;

    if (!access_token) {
      setHasCookieSignedIn(false);
      cookieSignOut();
      return;
    }

    cookieSignIn().then(() => setHasCookieSignedIn(true));
  }, [is_initializing, access_token, cookieSignOut, cookieSignIn]);

  // Trigger onAuthenticated listeners when the user is authenticated and has a user_id
  useEffect(() => {
    if (hasCookieSignedIn && Boolean(user.data.user_id) && !is_initializing && is_authenticated) {
      getOnAuthenticatedListeners().forEach(({ callback }) => callback(user.data));
    }
  }, [hasCookieSignedIn, user.data.user_id, is_initializing, is_authenticated]);

  const stateListener = useCallback(({ state, api }: HubListenerProps) => {
    hubListenerCb({
      state,
      api,
      callback: setState,
    })
  }, [hubListenerCb, setState]);

  return (
    <>
      <HubScriptInjector
        stateListener={stateListener}
        {...props}
      />
    </>
  );
};

export default Client;
