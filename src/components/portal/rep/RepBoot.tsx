import Image from 'next/image';
import s from './rep-boot.module.css';

/** Auth / first-paint placeholder on the D ground, so a load never flashes white. */
export function RepBoot() {
  return (
    <div className={s.boot} role="status" aria-label="Loading">
      <Image src="/logo.webp" alt="" width={550} height={516} sizes="40px" className={s.bootMark} priority />
    </div>
  );
}
