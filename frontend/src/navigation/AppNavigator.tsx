import React, { useEffect } from 'react';
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

// ─── Auth ──────────────────────────────────────────────────────────────────
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';

// ─── Driver ────────────────────────────────────────────────────────────────
import DriverDashboard from '../screens/driver/DriverDashboard';
import EarningsScreen from '../screens/driver/EarningsScreen';
import DriverProfileScreen from '../screens/driver/DriverProfileScreen';

// ─── Passenger ─────────────────────────────────────────────────────────────
import PassengerDashboard from '../screens/passenger/PassengerDashboard';
import PaymentStatusScreen from '../screens/passenger/PaymentStatusScreen';
import PassengerProfileScreen from '../screens/passenger/PassengerProfileScreen';
import RideHistory from '../screens/RideHistory';
import SettingsScreen from '../screens/passenger/SettingsScreen';

const AuthStack = createNativeStackNavigator();
const DriverTab = createBottomTabNavigator();
const PassengerTab = createBottomTabNavigator();

function useTabBarOptions() {
  const theme = useAppTheme();
  return {
    headerShown: false,
    tabBarStyle: {
        backgroundColor: theme.wixarika.navBackground,
        borderTopWidth: 0, // Remove default border — replaced by gradient
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
        {/* Gradient top border */}
        <LinearGradient
          colors={theme.wixarika.borderGradient as unknown as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 2, width: '100%' }}
        />
        {/* Tab bar background fill */}
        <View style={{ flex: 1, backgroundColor: theme.wixarika.navBackground }} />
      </View>
    ),
  };
}

// ─── DRIVER NAVIGATOR ───────────────────────────────────────────────────────
function DriverNavigator() {
    const { t } = useTranslation();
    const theme = useAppTheme();
    const tabBarOptions = useTabBarOptions();
    return (
        <DriverTab.Navigator screenOptions={tabBarOptions}>
            <DriverTab.Screen
                name="DriverHome"
                component={DriverDashboard}
                options={{ title: t('nav.home'), tabBarLabel: t('nav.home'), tabBarIcon: ({ color }) => <Map color={color} size={24} /> }}
            />
            <DriverTab.Screen
                name="DriverEarnings"
                component={EarningsScreen}
                options={{ title: t('nav.earnings'), tabBarLabel: t('nav.earnings'), tabBarIcon: ({ color }) => <Wallet color={color} size={24} /> }}
            />
            <DriverTab.Screen
                name="DriverHistory"
                component={RideHistory}
                options={{ title: t('nav.history'), tabBarLabel: t('nav.history'), tabBarIcon: ({ color }) => <Clock color={color} size={24} /> }}
            />
            <DriverTab.Screen
                name="DriverProfile"
                component={DriverProfileScreen}
                options={{ title: t('nav.profile'), tabBarLabel: t('nav.profile'), tabBarIcon: ({ color }) => <User color={color} size={24} /> }}
            />
            <DriverTab.Screen
                name="DriverSettings"
                component={SettingsScreen}
                options={{ title: t('nav.settings'), tabBarLabel: t('nav.settings'), tabBarIcon: ({ color, focused }) => <Settings color={focused ? theme.wixarika.navActive : theme.wixarika.navInactive} size={24} /> }}
            />
        </DriverTab.Navigator>
    );
}

// ─── PASSENGER NAVIGATOR ────────────────────────────────────────────────────
function PassengerNavigator() {
    const { t } = useTranslation();
    const theme = useAppTheme();
    const tabBarOptions = useTabBarOptions();
    return (
        <PassengerTab.Navigator screenOptions={tabBarOptions}>
            <PassengerTab.Screen
                name="PassengerHome"
                component={PassengerDashboard}
                options={{ title: t('nav.home'), tabBarLabel: t('nav.home'), tabBarIcon: ({ color }) => <Map color={color} size={24} /> }}
            />
            <PassengerTab.Screen
                name="PassengerPayment"
                component={PaymentStatusScreen}
                options={{ title: t('nav.payment'), tabBarLabel: t('nav.payment'), tabBarIcon: ({ color }) => <CreditCard color={color} size={24} /> }}
            />
            <PassengerTab.Screen
                name="PassengerHistory"
                component={RideHistory}
                options={{ title: t('nav.history'), tabBarLabel: t('nav.history'), tabBarIcon: ({ color }) => <Clock color={color} size={24} /> }}
            />
            <PassengerTab.Screen
                name="PassengerProfile"
                component={PassengerProfileScreen}
                options={{ title: t('nav.profile'), tabBarLabel: t('nav.profile'), tabBarIcon: ({ color }) => <User color={color} size={24} /> }}
            />
            <PassengerTab.Screen
                name="PassengerSettings"
                component={SettingsScreen}
                options={{ title: t('nav.settings'), tabBarLabel: t('nav.settings'), tabBarIcon: ({ color, focused }) => <Settings color={focused ? theme.wixarika.navActive : theme.wixarika.navInactive} size={24} /> }}
            />
        </PassengerTab.Navigator>
    );
}

// ─── ROOT NAVIGATOR ─────────────────────────────────────────────────────────
export default function AppNavigator() {
    const { user, isLoading, checkAuth } = useAuthStore();
    const theme = useAppTheme();

    useEffect(() => {
        checkAuth();
    }, []);

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <NavigationContainer ref={navigationRef}>
            <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
                {user ? (
                    user.role === 'DRIVER' ? (
                        <AuthStack.Screen name="DriverApp" component={DriverNavigator} />
                    ) : (
                        <AuthStack.Screen name="PassengerApp" component={PassengerNavigator} />
                    )
                ) : (
                    <>
                        <AuthStack.Screen name="Login" component={LoginScreen} />
                        <AuthStack.Screen name="Register" component={RegisterScreen} />
                    </>
                )}
            </AuthStack.Navigator>
        </NavigationContainer>
    );
}
