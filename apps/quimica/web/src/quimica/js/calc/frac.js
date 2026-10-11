// Frações exatas (BigInt) para a álgebra linear do balanceamento. Sem arredondamento: o resultado é inteiro e conferível.

export const mdc = (a, b) => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};
export const mmc = (a, b) => (a === 0n || b === 0n ? 0n : (a / mdc(a, b)) * (b < 0n ? -b : b));

export class Frac {
  /** @param {bigint|number} n @param {bigint|number} [d] */
  constructor(n, d = 1n) {
    n = BigInt(n);
    d = BigInt(d);
    if (d === 0n) throw new RangeError('denominador zero');
    if (d < 0n) { n = -n; d = -d; }
    const g = mdc(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
  }

  static de(x) { return x instanceof Frac ? x : new Frac(x); }
  add(o) { o = Frac.de(o); return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = Frac.de(o); return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = Frac.de(o); return new Frac(this.n * o.n, this.d * o.d); }
  div(o) { o = Frac.de(o); return new Frac(this.n * o.d, this.d * o.n); }
  neg() { return new Frac(-this.n, this.d); }
  get zero() { return this.n === 0n; }
  get inteiro() { return this.d === 1n; }
  sinal() { return this.n === 0n ? 0 : this.n > 0n ? 1 : -1; }
  toNumber() { return Number(this.n) / Number(this.d); }
  toString() { return this.d === 1n ? String(this.n) : `${this.n}/${this.d}`; }
}
