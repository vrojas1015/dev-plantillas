import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

/**
 * Botón base del design system. Componente de `ui/`: sin lógica de negocio,
 * sin inyectar stores ni clientes; todo entra por inputs y sale por outputs.
 *
 *   <ui-button variant="secondary" (pressed)="retry()">Reintentar</ui-button>
 */
@Component({
  selector: 'ui-button',
  templateUrl: './button.html',
  styleUrl: './button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly fullWidth = input(false);

  readonly pressed = output<MouseEvent>();

  protected readonly isDisabled = computed(() => this.disabled() || this.loading());

  /** Clases BEM: bloque + modificadores. */
  protected readonly classes = computed(() =>
    [
      'ui-button',
      `ui-button--${this.variant()}`,
      `ui-button--${this.size()}`,
      this.fullWidth() ? 'ui-button--full' : '',
      this.loading() ? 'ui-button--loading' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  protected onClick(event: MouseEvent): void {
    if (this.isDisabled()) return;
    this.pressed.emit(event);
  }
}
