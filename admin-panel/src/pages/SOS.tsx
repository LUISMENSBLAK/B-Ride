import React from 'react';
import styles from './Dashboard.module.css';

export default function SOS() {
    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.pageTitle}>Emergencias (SOS)</h1>
                <p className={styles.pageSubtitle}>Centro de respuesta a emergencias de la plataforma.</p>
            </header>
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <h3>Alertas Activas</h3>
                    <div className={styles.statValue}>0</div>
                </div>
            </div>
            <p style={{marginTop: '2rem'}}>Módulo de monitoreo en vivo de incidentes (En desarrollo).</p>
        </div>
    );
}
