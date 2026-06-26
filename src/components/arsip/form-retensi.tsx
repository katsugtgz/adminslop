/** A server action reference — `(formData) => Promise<void>`. */
export type ServerAksi = (formData: FormData) => Promise<void> | void;
