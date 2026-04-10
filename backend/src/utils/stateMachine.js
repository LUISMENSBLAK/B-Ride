const VALID_TRANSITIONS = {
  REQUESTED: ['NEGOTIATING', 'CANCELLED'],
  NEGOTIATING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['ARRIVED', 'CANCELLED'],
  ARRIVED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};

class StateMachine {
  /**
   * Valida si un cambio de estado es legal según las reglas de negocio
   */
  static isValidTransition(currentStatus, nextStatus) {
    if (!VALID_TRANSITIONS[currentStatus]) return false;
    return VALID_TRANSITIONS[currentStatus].includes(nextStatus);
  }

  /**
   * Arroja un error si el cambio de estado es ilegal
   */
  static validate(currentStatus, nextStatus) {
    if (!this.isValidTransition(currentStatus, nextStatus)) {
      throw new Error(`Transición ilegal de viaje: No se puede cambiar de ${currentStatus} a ${nextStatus}`);
    }
    return true;
  }
}

module.exports = StateMachine;
