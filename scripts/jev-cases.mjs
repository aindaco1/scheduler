// Scheduler owns these requirements and public synthetic controls. Platform owns
// request construction, transport and response validation.
export const pendingRequirements = {
  in_progress: "Calendar confirmation is still in progress.",
  no_early_confirmation:
    "Every statement about calendar confirmation presents it as an unfinished process.",
};
export const requirements = {
  confirmed:
    "The meeting is confirmed. An invitation or email that will be sent is not described as already received by the guest.",
  reschedule:
    "The original time stays reserved until the replacement time is confirmed.",
  cancelled:
    "The booking is cancelled, rather than still awaiting cancellation or still confirmed.",
  failed:
    "The booking was not confirmed and the guest should choose another available time.",
  unavailable:
    "Calendar checking is temporarily unavailable and the guest can retry. This failure is not presented as a successful check with no available times.",
  deadline:
    "The self-service change deadline has passed; a guest needing a change should contact the organizer through the calendar invitation.",
  reminder:
    "This is a reminder about an existing meeting, rather than a newly created booking or a cancellation.",
};

// Frozen before the first live evaluation. Separate validation examples are not
// used to choose the margin. Labels are engineering judgments, not certification.
const pairs = [
  [
    "calibration",
    "pending",
    "en",
    "Keep this page open while the calendar confirms your meeting.",
    "Your meeting is confirmed. Close this page and join at the scheduled time.",
  ],
  [
    "calibration",
    "pending",
    "es",
    "Espera mientras el calendario confirma tu reunión. Todavía no está confirmada.",
    "Tu reunión ya está confirmada. Puedes cerrar esta página.",
  ],
  [
    "calibration",
    "reschedule",
    "en",
    "Your current time remains reserved until the new time is confirmed.",
    "We release your original time immediately, even if the new time cannot be confirmed.",
  ],
  [
    "calibration",
    "reschedule",
    "es",
    "El horario actual sigue reservado hasta que se confirme el nuevo.",
    "Liberamos el horario original aunque todavía no se haya confirmado el nuevo.",
  ],
  [
    "calibration",
    "failed",
    "en",
    "This booking was not confirmed. Please choose another available time.",
    "Your booking is confirmed. There is no need to choose another time.",
  ],
  [
    "calibration",
    "failed",
    "es",
    "No se confirmó la reserva. Elige otro horario disponible.",
    "La reserva está confirmada. No hace falta elegir otro horario.",
  ],
  [
    "calibration",
    "unavailable",
    "en",
    "We could not check the calendars. Please try again later.",
    "The calendars were checked successfully. There are no openings.",
  ],
  [
    "calibration",
    "unavailable",
    "es",
    "No pudimos consultar los calendarios. Inténtalo de nuevo más tarde.",
    "Consultamos los calendarios correctamente y no hay horarios libres.",
  ],
  [
    "validation",
    "cancelled",
    "en",
    "Booking cancelled. Your calendar invitation will be updated.",
    "Cancellation is still pending. Your booking remains confirmed for now.",
  ],
  [
    "validation",
    "cancelled",
    "es",
    "La reserva está cancelada. Se actualizará la invitación del calendario.",
    "Todavía estamos procesando la cancelación. La reserva sigue confirmada.",
  ],
  [
    "validation",
    "deadline",
    "en",
    "The deadline for online changes has passed. Contact the organizer using your calendar invitation if you need a change.",
    "The online change deadline has passed. Please make any changes using the Reschedule button below.",
  ],
  [
    "validation",
    "deadline",
    "es",
    "Ya pasó el plazo para cambios en línea. Si necesitas cambiar algo, contacta a la persona organizadora mediante la invitación del calendario.",
    "Ya pasó el plazo para cambios en línea. Usa el botón Cambiar horario para modificar tu reserva.",
  ],
  [
    "validation",
    "reminder",
    "en",
    "A reminder: your previously booked meeting is tomorrow.",
    "We have cancelled your meeting for tomorrow.",
  ],
  [
    "validation",
    "reminder",
    "es",
    "Te recordamos que la reunión que reservaste es mañana.",
    "Hemos cancelado tu reunión de mañana.",
  ],
];

export const controls = pairs.flatMap(([split, kind, locale, good, bad]) =>
  [good, bad].map((candidate, index) => ({
    id: `${split}-${kind}-${locale}-${index ? "bad" : "good"}`,
    split,
    expected: index ? "fail" : "pass",
    candidate,
    requirements:
      kind === "pending"
        ? pendingRequirements
        : { meaning: requirements[kind] },
  })),
);

// Fresh validation for the atomic pending-state rubric. Frozen before its live
// evaluation; includes contradictions and missing status, not only paraphrases.
controls.push(
  ...[
    [
      "waiting-en",
      "pass",
      "We are waiting for the calendar to respond. Your meeting is not confirmed yet.",
      pendingRequirements,
    ],
    [
      "waiting-es",
      "pass",
      "Estamos esperando la respuesta del calendario. Tu reunión aún no está confirmada.",
      pendingRequirements,
    ],
    [
      "finished-en",
      "fail",
      "Everything is complete. Your meeting is confirmed and ready to attend.",
      pendingRequirements,
    ],
    [
      "finished-es",
      "fail",
      "Todo está listo. Tu reunión está confirmada y puedes asistir.",
      pendingRequirements,
    ],
    [
      "contradiction-en",
      "fail",
      "Calendar confirmation is still in progress. Your meeting is already confirmed.",
      { no_early_confirmation: pendingRequirements.no_early_confirmation },
    ],
    [
      "contradiction-es",
      "fail",
      "El calendario sigue procesando la confirmación. Tu reunión ya está confirmada.",
      { no_early_confirmation: pendingRequirements.no_early_confirmation },
    ],
    [
      "missing-en",
      "fail",
      "A conversation. Monday at 4 PM. Google Meet. Save this link.",
      { in_progress: pendingRequirements.in_progress },
    ],
    [
      "missing-es",
      "fail",
      "Una conversación. El lunes a las 16:00. Google Meet. Guarda este enlace.",
      { in_progress: pendingRequirements.in_progress },
    ],
  ].map(([id, expected, candidate, rules]) => ({
    id: `validation-pending-${id}`,
    split: "validation",
    expected,
    candidate,
    requirements: rules,
  })),
);

// Held out from the two earlier rubric trials: realistic surrounding details
// must neither imply confirmation nor hide an explicit conflicting claim.
controls.push(
  ...[
    [
      "waiting-en",
      "pass",
      "Waiting for the calendar\nWe are preparing your appointment and waiting for confirmation.\nPlanning call\nThursday, October 8, 2026 at 10:30 AM\nUTC · 45 minutes\nVideo call\nConfirmation is in progress. Save this private link to check the status.",
    ],
    [
      "waiting-es",
      "pass",
      "Esperando al calendario\nEstamos preparando tu cita y esperando la confirmación.\nLlamada de planificación\nJueves 8 de octubre de 2026 a las 10:30\nUTC · 45 minutos\nVideollamada\nLa confirmación está en curso. Guarda este enlace privado para consultar el estado.",
    ],
    [
      "conflicting-en",
      "fail",
      "Waiting for the calendar\nWe are preparing your appointment and waiting for confirmation.\nPlanning call\nThursday, October 8, 2026 at 10:30 AM\nUTC · 45 minutes\nVideo call\nThe calendar has confirmed your appointment. Save this private link to check the status.",
    ],
    [
      "conflicting-es",
      "fail",
      "Esperando al calendario\nEstamos preparando tu cita y esperando la confirmación.\nLlamada de planificación\nJueves 8 de octubre de 2026 a las 10:30\nUTC · 45 minutos\nVideollamada\nEl calendario ya confirmó tu cita. Guarda este enlace privado para consultar el estado.",
    ],
  ].map(([id, expected, candidate]) => ({
    id: `validation-pending-page-${id}`,
    split: "validation",
    expected,
    candidate,
    requirements: {
      no_early_confirmation: pendingRequirements.no_early_confirmation,
    },
  })),
);

export function renderedCase(id, candidate, rules) {
  return { id, candidate, requirements: rules };
}
