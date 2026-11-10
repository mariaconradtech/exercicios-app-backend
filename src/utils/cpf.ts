// Valida os dígitos verificadores do CPF (aceita com ou sem máscara).
export function cpfValido(cpf: string): boolean {
  const digitos = cpf.replace(/\D/g, '');

  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) {
    return false;
  }

  const calcularDigito = (quantidade: number) => {
    let soma = 0;
    for (let i = 0; i < quantidade; i += 1) {
      soma += Number(digitos[i]) * (quantidade + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(9) === Number(digitos[9]) && calcularDigito(10) === Number(digitos[10]);
}
