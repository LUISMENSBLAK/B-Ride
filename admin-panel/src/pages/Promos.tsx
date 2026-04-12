import React from 'react';
import styles from './Dashboard.module.css';

export default function Promos() {
    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.pageTitle}>Promociones</h1>
                <p className={styles.pageSubtitle}>Gestión de códigos de descuento y campañas.</p>
            </header>
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <h3>Cupones Activos</h3>
                    <div className={styles.statValue}>0</div>
                </div>
            </div>
            <p style={{marginTop: '2rem'}}>Módulo de creación y asignación de códigos (En desarrollo).</p>
        </div>
    );
}
