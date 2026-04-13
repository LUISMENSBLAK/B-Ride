import React, { useEffect, useState, Suspense } from 'react';
import { View, ActivityIndicator, Text as RNText } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../store/authStore';
import { navigationRef } from './NavigationService';
import { useTranslation } from '../hooks/useTranslation';
import { useAppTheme } from '../hooks/useAppTheme';
import type { Theme } from '../theme';

import {
  Map,
  Wallet,
  Clock,
  User,
  Settings,
  CreditCard
} from 'lucide-react-native';

// ─── Auth (lightweight — no lazy) ───────────────────────────────────────────
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import VerifyEmailScreen from '../screens/auth/VerifyEmailScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

// ─── Screens (Lazy) ─────────────────────────────────────────────────────────
const DriverDashboard = React.lazy(() => import('../screens/driver/DriverDashboard'));
const EarningsScreen = React.lazy(() => import('../screens/driver/EarningsScreen'));
const DriverProfileScreen = React.lazy(() => import('../screens/driver/DriverProfileScreen'));
const DriverOnboardingScreen = React.lazy(() => import('../screens/driver/DriverOnboardingScreen'));

const PassengerDashboard = React.lazy(() => import('../screens/passenger/PassengerDashboard'));
const PaymentStatusScreen = React.lazy(() => import('../screens/passenger/PaymentStatusScreen'));
const PassengerProfileScreen = React.lazy(() => import('../screens/passenger/PassengerProfileScreen'));
const RideHistory = React.lazy(() => import('../screens/RideHistory'));
const SettingsScreen = React.lazy(() => import('../screens/passenger/SettingsScreen'));

// ─── Legal ──────────────────────────────────────────────────────────────────
import LegalScreen, { hasAcceptedLegal } from '../screens/LegalScreen';

// ─── Loading fallback para Suspense ─────────────────────────────────────────
function ScreenLoadingFallback() {
  const theme = useAppTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );
}

const AuthStack = createNativeStackNavigator();
const DriverTab = createBottomTabNavigator();
const DriverStack = createNativeStackNavigator();  // Stack para bloquear onboarding
const PassengerTab = createBottomTabNavigator();

function useTabBarOptions() {
  const theme = useAppTheme();
  return {
    headerShown: false,
    tabBarStyle: {
        backgroundColor: theme.wixarika.navBackground,
        borderTopWidth: 0,
        height: 62,
        paddingBottom: 10,
        paddingTop: 6,
        elevation: 0,
    },
    tabBarActiveTintColor: theme.wixarika.navActive,
    tabBarInactiveTintColor: theme.wixarika.navInactive,
    tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
    tabBarBackground: () => (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <LinearGradient
          colors={theme.wixarika.borderGradient as unknown as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 2, width: '100%' }}
        />
        <View style={{ flex: 1, backgroundColor: theme.wixarika.navBackground }} />
      </View>
    ),
  };
}

// ─── DRIVER TABS ─────────────────────────────────────────────────────────────
function DriverTabNavigator() {
    const { t } = useTranslation();
    const theme = useAppTheme();
    const tabBarOptions = useTabBarOptions();
    return (
        <DriverTab.Navigator screenOptions={tabBarOptions}>
            <DriverTab.Screen
                name="DriverHome"
                options={{ title: t('nav.home'), tabBarLabel: t('nav.home'), tabBarIcon: ({ color }) => <Map color={color} size={24} /> }}
            >
                {() => <DriverDashboard />}
            </DriverTab.Screen>
            <DriverTab.Screen
                name="DriverEarnings"
                options={{ title: t('nav.earnings'), tabBarLabel: t('nav.earnings'), tabBarIcon: ({ color }) => <Wallet color={color} size={24} /> }}
            >
                {() => <EarningsScreen />}
            </DriverTab.Screen>
            <DriverTab.Screen
                name="DriverHistory"
                options={{ title: t('nav.history'), tabBarLabel: t('nav.history'), tabBarIcon: ({ color }) => <Clock color={color} size={24} /> }}
            >
                {() => <RideHistory />}
            </DriverTab.Screen>
            <DriverTab.Screen
                name="DriverProfile"
                options={{ title: t('nav.profile'), tabBarLabel: t('nav.profile'), tabBarIcon: ({ color }) => <User color={color} size={24} /> }}
            >
                {() => <DriverProfileScreen />}
            </DriverTab.Screen>
            <DriverTab.Screen
                name="DriverSettings"
                options={{ title: t('nav.settings'), tabBarLabel: t('nav.settings'), tabBarIcon: ({ color, focused }) => <Settings color={focused ? theme.wixarika.navActive : theme.wixarika.navInactive} size={24} /> }}
            >
                {() => <SettingsScreen />}
            </DriverTab.Screen>
        </DriverTab.Navigator>
    );
}

// ─── DRIVER NAVIGATOR (Stack que bloquea según estado de aprobación) ─────────
function DriverNavigator() {
    const { user } = useAuthStore();

    // Ambas condiciones deben cumplirse para considerar al conductor APROBADO
    const isApproved =
        user?.approvalStatus === 'APPROVED' &&
        user?.driverApprovalStatus === 'APPROVED';

    return (
        <DriverStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
            {isApproved ? (
                <DriverStack.Screen name="DriverTabs" component={DriverTabNavigator} />
            ) : (
                <DriverStack.Screen name="DriverOnboarding">
                    {() => <DriverOnboardingScreen />}
                </DriverStack.Screen>
            )}
        </DriverStack.Navigator>
    );
}

// ─── PASSENGER HOME STACK ────────────────────────────────────────────────────
const PassengerHomeStack = createNativeStackNavigator();

function PassengerHomeStackScreen() {
    return (
        <PassengerHomeStack.Navigator screenOptions={{ headerShown: false }}>
            <PassengerHomeStack.Screen name="PassengerDashboard">
                {() => <PassengerDashboard />}
            </PassengerHomeStack.Screen>
            <PassengerHomeStack.Screen name="PassengerPayment">
                {() => <PaymentStatusScreen />}
            </PassengerHomeStack.Screen>
        </PassengerHomeStack.Navigator>
    );
}

// ─── PASSENGER NAVIGATOR ─────────────────────────────────────────────────────
function PassengerNavigator() {
    const { t } = useTranslation();
    const theme = useAppTheme();
    const tabBarOptions = useTabBarOptions();
    return (
        <PassengerTab.Navigator screenOptions={tabBarOptions}>
            <PassengerTab.Screen
                name="PassengerHome"
                options={{ title: t('nav.home'), tabBarLabel: t('nav.home'), tabBarIcon: ({ color }) => <Map color={color} size={24} /> }}
            >
                {() => <PassengerHomeStackScreen />}
            </PassengerTab.Screen>
            <PassengerTab.Screen
                name="PassengerHistory"
                options={{ title: t('nav.history'), tabBarLabel: t('nav.history'), tabBarIcon: ({ color }) => <Clock color={color} size={24} /> }}
            >
                {() => <RideHistory />}
            </PassengerTab.Screen>
            <PassengerTab.Screen
                name="PassengerProfile"
                options={{ title: t('nav.profile'), tabBarLabel: t('nav.profile'), tabBarIcon: ({ color }) => <User color={color} size={24} /> }}
            >
                {() => <PassengerProfileScreen />}
            </PassengerTab.Screen>
            <PassengerTab.Screen
                name="PassengerSettings"
                options={{ title: t('nav.settings'), tabBarLabel: t('nav.settings'), tabBarIcon: ({ color, focused }) => <Settings color={focused ? theme.wixarika.navActive : theme.wixarika.navInactive} size={24} /> }}
            >
                {() => <SettingsScreen />}
            </PassengerTab.Screen>
        </PassengerTab.Navigator>
    );
}

// ─── ROOT NAVIGATOR ──────────────────────────────────────────────────────────

// Deep link config para Stripe onboarding return
const linking = {
  prefixes: ['bride://'],
  config: {
    screens: {
      DriverApp: {
        screens: {
          DriverHome: 'driver/onboarding/return',
        },
      },
    },
  },
};

export default function AppNavigator() {
    const { user, isLoading, checkAuth, justRegistered } = useAuthStore();
    const theme = useAppTheme();
    const [legalAccepted, setLegalAccepted] = useState<boolean | null>(null);

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        hasAcceptedLegal().then(setLegalAccepted);
    }, []);

    if (isLoading || legalAccepted === null) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <NavigationContainer ref={navigationRef} linking={linking}>
            <Suspense fallback={<ScreenLoadingFallback />}>
                <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
                    {user ? (
                        justRegistered ? (
                            <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} initialParams={{ email: user.email }} />
                        ) : !legalAccepted ? (
                            <AuthStack.Screen name="Legal">
                                {() => <LegalScreen onAccept={() => setLegalAccepted(true)} />}
                            </AuthStack.Screen>
                        ) : (
                            user.role === 'DRIVER' ? (
                                <AuthStack.Screen name="DriverApp" component={DriverNavigator} />
                            ) : (
                                <AuthStack.Screen name="PassengerApp" component={PassengerNavigator} />
                            )
                        )
                    ) : (
                        <>
                            <AuthStack.Screen name="Login" component={LoginScreen} />
                            <AuthStack.Screen name="Register" component={RegisterScreen} />
                            <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
                            <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
                        </>
                    )}
                </AuthStack.Navigator>
            </Suspense>
        </NavigationContainer>
    );
}
