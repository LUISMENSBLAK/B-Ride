import React from 'react';
import styles from './Dashboard.module.css';

export default function Analytics() {
    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.pageTitle}>Analytics</h1>
                <p className={styles.pageSubtitle}>Métricas financieras y operativas de plataforma.</p>
            </header>
            <p style={{marginTop: '2rem'}}>Generación de reportes PDF y gráficas de retención (En desarrollo).</p>
        </div>
    );
}
