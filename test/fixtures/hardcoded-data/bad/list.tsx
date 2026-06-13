export const MARCAS = ["Nike","Adidas","Puma","Reebok","Fila","Asics","Vans","Converse","NewBalance"];
export default function Page() { return <ul>{MARCAS.map(m => <li key={m}>{m}</li>)}</ul>; }
