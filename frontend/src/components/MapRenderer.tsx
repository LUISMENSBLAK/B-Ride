import React, { memo, forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { StyleSheet, Platform, View, ActivityIndicator, Text, TouchableOpacity, Alert } from 'react-native';
import MapView, { Marker, Region, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from '../hooks/useTranslation';
import * as Location from 'expo-location';
import { LocateFixed } from 'lucide-react-native';

import CarMarker from './CarMarker';
import PassengerLocationMarker from './PassengerLocationMarker';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface MapRendererHandle {
  updateDriverPosition: (lat: number, lng: number) => void;
}

interface MapRendererProps {
  latitude: number;
  longitude: number;
  title?: string;
  isDriver?: boolean;
  destinationCoordinate?: Coordinate;
  /** Driver-only: pickup location to draw route to */
  pickupCoordinate?: Coordinate;
  /** Driver-only: dropoff location for IN_PROGRESS phase */
  dropoffCoordinate?: Coordinate;
  /** Driver phase: determines which polyline to show */
  driverPhase?: 'TO_PICKUP' | 'TO_DESTINATION' | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Validate coordinate is geographically sane */
function isValidCoord(c: Coordinate | undefined | null): c is Coordinate {
  if (!c) return false;
  return c.latitude >= -90 && c.latitude <= 90 && c.longitude >= -180 && c.longitude <= 180
    && !(c.latitude === 0 && c.longitude === 0);
}

/** Generate a smooth curved polyline between two points (no API needed) */
function generateCurvedPolyline(start: Coordinate, end: Coordinate, numPoints = 30): Coordinate[] {
  const dLat = end.latitude - start.latitude;
  const dLng = end.longitude - start.longitude;
  const dist = Math.sqrt(dLat * dLat + dLng * dLng);

  // BUG 6 FIX: Si start ≈ end, retornar línea recta para evitar NaN
  if (dist < 0.0001) return [start, end];

  const points: Coordinate[] = [];
  const midLat = (start.latitude + end.latitude) / 2;
  const midLng = (start.longitude + end.longitude) / 2;

  const offset = dist * 0.15; // 15% curvature

  // Control point perpendicular to the midpoint
  const controlLat = midLat + (-dLng / dist) * offset;
  const controlLng = midLng + (dLat / dist) * offset;

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const invT = 1 - t;
    // Quadratic Bezier curve
    const lat = invT * invT * start.latitude + 2 * invT * t * controlLat + t * t * end.latitude;
    const lng = invT * invT * start.longitude + 2 * invT * t * controlLng + t * t * end.longitude;
    points.push({ latitude: lat, longitude: lng });
  }
  return points;
}

/** Fetch real street directions from OSRM */
async function fetchOsrmRoute(start: Coordinate, end: Coordinate): Promise<Coordinate[] | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 sec timeout

    const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`;
    
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();
    
    if (data.routes && data.routes.length > 0) {
      const coords = data.routes[0].geometry.coordinates;
      return coords.map((c: number[]) => ({
        latitude: c[1],
        longitude: c[0]
      }));
    }
  } catch (e) {
    return null;
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const MapRenderer = forwardRef<MapRendererHandle, MapRendererProps>(({
  latitude,
  longitude,
  title = "Tú estás aquí",
  isDriver = false,
  destinationCoordinate,
  pickupCoordinate,
  dropoffCoordinate,
  driverPhase
}, ref) => {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { t } = useTranslation();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const [isLocating, setIsLocating] = useState(false);
  const mapRef = useRef<MapView>(null);
  const driverMarkerRef = useRef<any>(null);

  // Initial region (evaluated once)
  const [initialRegion] = useState<Region>({
    latitude, longitude,
    latitudeDelta: 0.05, longitudeDelta: 0.05,
  });

  // Driver tracking marker
  const [firstDriverPing, setFirstDriverPing] = useState<Coordinate | null>(null);

  // For calculating smooth rotation of the car icon
  const [heading, setHeading] = useState<number>(0);
  const prevCoordRef = useRef<Coordinate>({ latitude, longitude });

  useEffect(() => {
    // If we're rendering a tracked driver (for passenger) or it's the driver viewing their own map
    const prev = prevCoordRef.current;
    if (latitude !== prev.latitude || longitude !== prev.longitude) {
      if (Math.abs(latitude - prev.latitude) > 0.00001 || Math.abs(longitude - prev.longitude) > 0.00001) {
        const dy = latitude - prev.latitude;
        const dx = Math.cos(Math.PI / 180 * prev.latitude) * (longitude - prev.longitude);
        const angle = Math.atan2(dx, dy) * 180 / Math.PI;
        setHeading(angle);
      }
      prevCoordRef.current = { latitude, longitude };
    }
  }, [latitude, longitude]);

  // BUG 12 FIX: Siempre actualizar firstDriverPing para asegurar que el marker se renderice.
  // Usar animateMarkerToCoordinate como optimización cuando el marker ya está montado
  const mapUpdateThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({
    updateDriverPosition: (lat: number, lng: number) => {
      // Calcular heading si hay posición previa
      setFirstDriverPing((currentPing) => {
         if (currentPing) {
           if (currentPing.latitude !== lat || currentPing.longitude !== lng) {
             const dy = lat - currentPing.latitude;
             const dx = Math.cos(Math.PI / 180 * currentPing.latitude) * (lng - currentPing.longitude);
             const angle = Math.atan2(dx, dy) * 180 / Math.PI;
             setHeading(angle);
           }
         }
         return { latitude: lat, longitude: lng };
      });

      // Animación nativa suave (Interpolación a 60fps vía Maps API)
      if (driverMarkerRef.current && typeof driverMarkerRef.current.animateMarkerToCoordinate === 'function') {
        driverMarkerRef.current.animateMarkerToCoordinate(
          { latitude: lat, longitude: lng }, 1500
        );
      }
    }
  }));

  // Camera auto-fit
  useEffect(() => {
    if (!mapRef.current) return;

    if (isDriver && driverPhase === 'TO_PICKUP' && isValidCoord(pickupCoordinate)) {
      mapRef.current.fitToCoordinates(
        [{ latitude, longitude }, pickupCoordinate],
        { edgePadding: { top: 120, right: 80, bottom: 300, left: 80 }, animated: true }
      );
    } else if (isDriver && driverPhase === 'TO_DESTINATION' && isValidCoord(pickupCoordinate) && isValidCoord(dropoffCoordinate)) {
      mapRef.current.fitToCoordinates(
        [pickupCoordinate, dropoffCoordinate],
        { edgePadding: { top: 120, right: 80, bottom: 300, left: 80 }, animated: true }
      );
    } else if (!isDriver && isValidCoord(destinationCoordinate)) {
      mapRef.current.fitToCoordinates(
        [{ latitude, longitude }, destinationCoordinate],
        { edgePadding: { top: 100, right: 80, bottom: 400, left: 80 }, animated: true }
      );
    } else {
      mapRef.current.animateToRegion({
        latitude, longitude, latitudeDelta: 0.05, longitudeDelta: 0.05,
      }, 800);
    }
  }, [latitude, longitude, destinationCoordinate, pickupCoordinate, dropoffCoordinate, driverPhase, isDriver]);

  // ── Compute polyline points ──
  const [polylinePoints, setPolylinePoints] = useState<Coordinate[] | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  // UX 3: Indicar si la ruta mostrada es fallback (bezier) o real (OSRM)
  const [routeFallback, setRouteFallback] = useState(false);

  // PERF FIX: Only re-fetch OSRM route when destination/phase changes, NOT on every GPS tick.
  // Use a ref for the current position so the route start point is always fresh without triggering re-fetches.
  const currentPosRef = useRef<Coordinate>({ latitude, longitude });
  currentPosRef.current = { latitude, longitude };

  useEffect(() => {
    let cancelled = false;
    let end: Coordinate | null = null;

    if (isDriver) {
      if (driverPhase === 'TO_PICKUP' && isValidCoord(pickupCoordinate)) {
        end = pickupCoordinate;
      } else if (driverPhase === 'TO_DESTINATION' && isValidCoord(dropoffCoordinate)) {
        end = dropoffCoordinate;
      }
    } else if (isValidCoord(destinationCoordinate)) {
      end = destinationCoordinate;
    }

    if (end) {
      const start = currentPosRef.current;
      const calculateRoute = async () => {
        setPolylinePoints(generateCurvedPolyline(start, end!)); // Immediate visual feedback
        setRouteFallback(true);
        setRouteLoading(true);
        const realRoute = await fetchOsrmRoute(start, end!);
        if (cancelled) return;
        setRouteLoading(false);
        if (realRoute) {
          setPolylinePoints(realRoute);
          setRouteFallback(false);
        }
      };
      calculateRoute();
    } else {
      setPolylinePoints(null);
      setRouteFallback(false);
    }

    return () => { cancelled = true; };
  }, [destinationCoordinate, pickupCoordinate, dropoffCoordinate, driverPhase, isDriver]);

  // ── Polyline destination marker ──
  const polylineEndpoint = React.useMemo<Coordinate | null>(() => {
    if (isDriver) {
      if (driverPhase === 'TO_PICKUP' && isValidCoord(pickupCoordinate)) return pickupCoordinate;
      if (driverPhase === 'TO_DESTINATION' && isValidCoord(dropoffCoordinate)) return dropoffCoordinate;
    } else if (isValidCoord(destinationCoordinate)) {
      return destinationCoordinate;
    }
    return null;
  }, [isDriver, driverPhase, pickupCoordinate, dropoffCoordinate, destinationCoordinate, latitude, longitude]);

  const handleCenterLocation = async () => {
    try {
      setIsLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('general.locationDenied'), t('errors.locationNotReadyMsg'));
        setIsLocating(false);
        return;
      }

      let loc = await Location.getLastKnownPositionAsync();
      if (!loc) {
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      }
      
      if (loc && mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01
        }, 1000);
      }
    } catch (error) {
      Alert.alert('Error', t('general.locationFailed'));
    } finally {
      setIsLocating(false);
    }
  };

  return (
    <>
    <MapView
      ref={mapRef}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      style={styles.map}
      initialRegion={initialRegion}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
    >
      {/* Own position marker */}
      {isDriver ? (
        <Marker coordinate={{ latitude, longitude }} title={title} anchor={{ x: 0.5, y: 0.5 }}>
          <CarMarker heading={heading} size={28} />
        </Marker>
      ) : (
        <Marker coordinate={{ latitude, longitude }} title={title} anchor={{ x: 0.5, y: 0.5 }}>
          <PassengerLocationMarker />
        </Marker>
      )}

      {/* Route polyline — double line: dark base + gold top */}
      {polylinePoints && (
        <>
          {/* Shadow / base layer — dark thick */}
          <Polyline
            coordinates={polylinePoints}
            strokeColor="rgba(0,0,0,0.45)"
            strokeWidth={9}
            lineDashPattern={Platform.OS === 'ios' ? undefined : [1]}
          />
          {/* Top layer — brand gold */}
          <Polyline
            coordinates={polylinePoints}
            strokeColor={theme.wixarika.mapRoute}
            strokeWidth={5}
            lineDashPattern={Platform.OS === 'ios' ? undefined : [1]}
          />
        </>
      )}

      {/* Endpoint marker */}
      {polylineEndpoint && (
        <Marker
          coordinate={polylineEndpoint}
          title={isDriver && driverPhase === 'TO_PICKUP' ? t('driver.passenger') : t('history.destination')}
          pinColor={isDriver && driverPhase === 'TO_PICKUP' ? theme.wixarika.mapPinOrigen : theme.wixarika.mapPinDestino}
        />
      )}

      {/* Tracked driver (passenger view during active ride) */}
      {firstDriverPing && !isDriver && (
        <Marker
          ref={driverMarkerRef}
          coordinate={firstDriverPing}
          title={t('auth.roleDriver')}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <CarMarker heading={heading} size={28} />
        </Marker>
      )}
    </MapView>
    {routeLoading && (
      <View style={[styles.routingOverlay, { top: insets.top + 8 }]}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={styles.routingText}>{t('history.loading')}</Text>
      </View>
    )}
    {!routeLoading && routeFallback && polylinePoints && (
      <View style={[styles.routingOverlay, { top: insets.top + 8 }]}>
        <Text style={styles.routingText}>Ruta aproximada</Text>
      </View>
    )}
    
    <TouchableOpacity 
      style={[styles.locateBtn, { bottom: isDriver ? 140 : 180 }]} 
      onPress={handleCenterLocation}
      disabled={isLocating}
      activeOpacity={0.8}
    >
      {isLocating ? (
        <ActivityIndicator size="small" color={theme.colors.text} />
      ) : (
        <LocateFixed size={22} color={theme.colors.text} strokeWidth={2.5} />
      )}
    </TouchableOpacity>
    </>
  );
});

const getStyles = (theme: ReturnType<typeof useAppTheme>) => StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  routingOverlay: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  routingText: {
    ...theme.typography.caption,
    color: theme.colors.text,
    fontWeight: '600',
  },
  locateBtn: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  }
});

export default memo(MapRenderer);
