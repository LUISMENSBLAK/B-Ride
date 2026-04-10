const axios = require('axios');
const io = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../src/models/User');
const Ride = require('../src/models/Ride');

const API_URL = 'http://localhost:5001/api';
const SOCKET_URL = 'http://localhost:5001';

// Almacén de Reportes
const report = {
    total: 0,
    passed: 0,
    failed: 0,
    results: []
};

function logResult(testName, status, details = {}) {
    report.total++;
    if (status === 'PASS') report.passed++;
    else report.failed++;

    const res = {
        test: testName,
        result: status,
        details,
        timestamp: new Date().toISOString()
    };
    report.results.push(res);
    console.log(`\n[${status}] ${testName}`);
    console.log(`Details: ${JSON.stringify(details, null, 2)}`);
}

// Timeout helper (Throw timeout)
const withTimeout = (promise, ms, rejectMsg = 'Timeout exceeded') => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(rejectMsg)), ms))
    ]);
};

const delay = ms => new Promise(res => setTimeout(res, ms));

async function setupDummies() {
    console.log('--- GENERANDO DATOS DUMMY ---');
    try {
        await mongoose.connect(process.env.MONGO_URI);
        // Clean previa test dummies
        await User.deleteMany({ email: /@testdummy\.ai$/ });
        await Ride.deleteMany({ 'pickupLocation.address': 'TEST_DUMMY_ADDRESS' });

        const passGen = await axios.post(`${API_URL}/auth/register`, {
            name: 'Test Passenger',
            email: 'pass1@testdummy.ai',
            password: 'password123',
            role: 'USER'
        });

        const drivers = [];
        for (let i = 1; i <= 3; i++) {
            const drv = await axios.post(`${API_URL}/auth/register`, {
                name: `Test Driver ${i}`,
                email: `drv${i}@testdummy.ai`,
                password: 'password123',
                role: 'DRIVER'
            });
            drivers.push(drv.data.data);
        }

        return { passenger: passGen.data.data, drivers };
    } catch (e) {
        console.error('Error inicializando Mongoose o DB:', e.message);
        throw e;
    }
}

async function cleanupDummies() {
    console.log('\n--- CLEANUP DB ---');
    try {
        await User.deleteMany({ email: /@testdummy\.ai$/ });
        await Ride.deleteMany({ 'pickupLocation.address': 'TEST_DUMMY_ADDRESS' });
        await mongoose.disconnect();
        console.log('Cleanup completado.');
    } catch (e) {
        console.error('Error en cleanup:', e.message);
    }
}

// Conectar Socket cliente helper
function createClient(token, userId) {
    return new Promise((resolve) => {
        const socket = io(SOCKET_URL, { extraHeaders: { Authorization: `Bearer ${token}` }, reconnection: true });
        socket.on('connect', () => {
            socket.emit('join', userId);
            resolve(socket);
        });
    });
}

// -----------------------------------------
// SUITE DE PRUEBAS
// -----------------------------------------

async function runTests() {
    const { passenger, drivers } = await setupDummies();
    
    // Conectar clientes
    const pSocket = await createClient(passenger.accessToken, passenger._id);
    const dSockets = await Promise.all(drivers.map(d => createClient(d.accessToken, d._id)));

    let testRide = null;

    // --- TEST 0: PREPARAR VIAJE BÁSICO ---
    try {
        const rideAck = await withTimeout(
            pSocket.timeout(5000).emitWithAck('requestRide', {
                passengerId: passenger._id,
                eventId: uuidv4(),
                pickupLocation: { latitude: 0, longitude: 0, address: 'TEST_DUMMY_ADDRESS' },
                dropoffLocation: { latitude: 1, longitude: 1, address: 'TEST_DUMMY_DEST' },
                proposedPrice: 10
            }), 10000, 'Tardó demasiado creando requestRide'
        );
        testRide = rideAck.newRide;
        pSocket.emit('join_ride_room', testRide._id);
        dSockets.forEach(s => s.emit('join_ride_room', testRide._id)); // Drivers también unen para test
    } catch (e) {
        console.error("Fallo PRE-REQUISITO:", e.message);
        return await cleanupDummies();
    }


    // --- 🔴 TEST 1: PRUEBA DE DUPLICACIÓN (IDEMPOTENCIA BOMBING) ---
    console.log('\n>>> Iniciando Test 1: Bombardeo Idempotente...');
    try {
        const eventId = uuidv4();
        
        // El conductor envía la oferta base 1 vez
        const bidData = {
             rideId: testRide._id,
             driverId: drivers[0]._id,
             price: 15,
             passengerId: passenger._id, // Esto puede ir directo al server
             eventId: uuidv4()
        };
        await dSockets[0].timeout(3000).emitWithAck('trip_bid', bidData);
        
        // Recuperamos el bid generado de la DB (fake it till you fetch it)
        const activeRide = await Ride.findById(testRide._id);
        const activeBid = activeRide.bids[0]._id.toString();

        // El Pasajero acepta 5 VECES SIMULTÁNEAS exactas
        const acceptPayload = {
             rideId: testRide._id,
             passengerId: passenger._id,
             bidId: activeBid,
             driverId: drivers[0]._id,
             eventId: eventId
        };

        const promises = [];
        for(let i = 0; i < 5; i++) { promises.push(pSocket.timeout(3000).emitWithAck('trip_accept_bid', acceptPayload)); }
        
        const responses = await Promise.all(promises);
        
        const processed = responses.filter(r => r.status === 'processed');
        const duplicated = responses.filter(r => r.status === 'duplicate_ignored');

        if (processed.length === 1 && duplicated.length === 4) {
             const finalCheck = await Ride.findById(testRide._id);
             if (finalCheck.status === 'ACCEPTED' && finalCheck.version >= 2) {
                 logResult('Prueba Idempotencia (5 Requests)', 'PASS', { processed: processed.length, ignored: duplicated.length });
             } else { throw new Error('Estado en BD no es ACCEPTED tras procesar.'); }
        } else {
             throw new Error(`Valores extraños. Procesados: ${processed.length}, Ignorados: ${duplicated.length}`);
        }
    } catch(e) {
        logResult('Prueba Idempotencia (5 Requests)', 'FAIL', { error: e.message });
    }


    // --- 🔴 TEST 4: RETRY RACE CONDITION (Desorden de Red) ---
    console.log('\n>>> Iniciando Test 4 (Añadido): Retry Race Condition...');
    try {
         // El driver cambia estado ARRIVED simulando 2 paquetes donde uno se atora
         const eventIdRC = uuidv4();
         const stateUpdPayload = {
            rideId: testRide._id,
            driverId: drivers[0]._id,
            passengerId: passenger._id,
            nextStatus: 'ARRIVED',
            eventId: eventIdRC
         };

         // Enviamos paquete 1 (viaja lento y sin callback estricto local)
         const p1 = new Promise((resolve) => {
             setTimeout(() => {
                 dSockets[0].timeout(5000).emitWithAck('update_trip_state', stateUpdPayload).then(resolve).catch(resolve);
             }, 800); // 800ms latencia
         });

         // Enviamos paquete 2 (viaja rapido y llega primero)
         const p2 = dSockets[0].timeout(3000).emitWithAck('update_trip_state', stateUpdPayload);

         const [res1, res2] = await Promise.all([p1, p2]);
         
         const responses = [res1, res2];
         const isProcessedOnce = responses.some(r => r && r.status === 'processed') && responses.some(r => r && r.status === 'duplicate_ignored');

         if (isProcessedOnce) {
             logResult('Retry Race Condition (Paquetes desordenados)', 'PASS', { description: 'El sistema priorizó el que llegó y descartó el otro intactable' });
         } else {
             throw new Error('Ambos ejecutados o fallados.');
         }
    } catch(e) {
         logResult('Retry Race Condition (Paquetes desordenados)', 'FAIL', { error: e.message });
    }

    // --- 🔴 TEST 2: RED LENTA SIMULADA (Retries manuales del timeout IO) ---
    console.log('\n>>> Iniciando Test 2: Red Lenta (Timeout IO Emit)...');
    try {
        const payload = { 
            rideId: testRide._id, driverId: drivers[0]._id, passengerId: passenger._id, 
            nextStatus: 'IN_PROGRESS', eventId: uuidv4() 
        };

        // Si tuviéramos un retraso artificial en socket server, usaríamos timeout pequeño. 
        // Como no podemos retrasar al servidor desde el cliente sin inyectar middleware,  probaremos la respuesta del timeout de IO.
        const start = Date.now();
        const res = await withTimeout(dSockets[0].timeout(20000).emitWithAck('update_trip_state', payload), 30000);
        
        if (res.status === 'processed') {
            logResult('Ack Response Time (Simulación OK)', 'PASS', { timeToAckMs: Date.now() - start });
        } else {
            throw new Error('No obtuve status processed.');
        }
    } catch(e) {
        logResult('Ack Response Time (Simulación OK)', 'FAIL', { error: e.message });
    }

    // --- 🔴 TEST 3: CORTE TOTAL / WATCHDOG ---
    console.log('\n>>> Iniciando Test 3: Corte de red y Watchdog (10s y 25s)...');
    try {
         // El conductor se "desconecta" logicamente (deja de mandar heartbeat)
         let warningRecv = false;
         let disconnectRecv = false;
         
         const listenWarning = new Promise(resolve => {
             pSocket.once('driver_warning', () => { warningRecv = true; resolve(); });
         });
         const listenDisconnect = new Promise(resolve => {
             pSocket.once('driver_disconnected', () => { disconnectRecv = true; resolve(); });
         });

         // Inyectamos el heartbeat "OK"
         dSockets[0].emit('driver_heartbeat', { driverId: drivers[0]._id, rideId: testRide._id });

         // Esperamos hasta 28 segundos para que el servidor expulse los pings
         console.log('Esperando Watchdog (Esto tomará 25s)...');
         await withTimeout(Promise.all([listenWarning, listenDisconnect]), 30000, 'No llegaron las notificaciones a tiempo');

         logResult('Prueba Total Network Cut Watchdog', 'PASS', {
             receivedWarningAt10s: warningRecv,
             receivedDisconnectAt25s: disconnectRecv
         });
    } catch(e) {
         logResult('Prueba Total Network Cut Watchdog', 'FAIL', { error: e.message });
    }

    // --- 🔴 TEST 5: MULTI-CLIENTE COMPETITION ---
    console.log('\n>>> Iniciando Test 5: Reasignación y colisiones...');
    try {
        // Driver 0 está desconectado en la lógica
        // Generamos un nuevo viaje del passenger
        const newRideAck = await pSocket.timeout(5000).emitWithAck('requestRide', {
             passengerId: passenger._id,
             eventId: uuidv4(),
             pickupLocation: { latitude: 0, longitude: 0, address: 'TEST_MULTI' },
             dropoffLocation: { latitude: 1, longitude: 1, address: 'TEST_MULTI_DEST' },
             proposedPrice: 20
        });

        const activeRideId2 = newRideAck.newRide._id;

        // Driver 1 y 2 ofertan
        await dSockets[1].timeout(3000).emitWithAck('trip_bid', {
             rideId: activeRideId2, driverId: drivers[1]._id, price: 25, passengerId: passenger._id, eventId: uuidv4()
        });
        await dSockets[2].timeout(3000).emitWithAck('trip_bid', {
             rideId: activeRideId2, driverId: drivers[2]._id, price: 30, passengerId: passenger._id, eventId: uuidv4()
        });

        const mRide = await Ride.findById(activeRideId2);
        const bid1 = mRide.bids.find(b => b.driver.toString() === drivers[1]._id)._id;

        // Pasajero acepta Bid 1
        let rejectedCaught = false;
        dSockets[2].on('trip_rejected', () => { rejectedCaught = true; });

        await pSocket.timeout(4000).emitWithAck('trip_accept_bid', {
             rideId: activeRideId2, passengerId: passenger._id, bidId: bid1, driverId: drivers[1]._id, eventId: uuidv4()
        });

        await delay(500); // Esperar cascada

        if (rejectedCaught) {
            logResult('Multi-Cliente y Mutually Exclusive Cascade', 'PASS', { 
                isolatedDriverWon: drivers[1]._id, 
                competitorRejected: drivers[2]._id,
                cascade: true
            });
        } else {
            throw new Error('El competidor no recibió trip_rejected');
        }
    } catch(e) {
        logResult('Multi-Cliente y Mutually Exclusive Cascade', 'FAIL', { error: e.message });
    }

    // --- REPORTE CONSOLIDADO END ---
    pSocket.disconnect();
    dSockets.forEach(s => s.disconnect());
    await cleanupDummies();

    console.log('\n==================================');
    console.log('🏁 REPORTE FINAL CONSOLIDADO JSON:');
    console.log('==================================');
    console.log(JSON.stringify(report, null, 2));

    process.exit(report.failed > 0 ? 1 : 0);
}

runTests();
