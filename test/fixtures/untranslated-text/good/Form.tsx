import { useTranslations } from "next-intl";

export default function Form() {
  const t = useTranslations();
  return (
    <form>
      <label>{t("form.name")}</label>
      <input placeholder={t("form.namePlaceholder")} />
      <button>{t("form.submit")}</button>
    </form>
  );
}
