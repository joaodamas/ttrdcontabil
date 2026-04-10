import * as admin from 'firebase-admin'
admin.initializeApp()

export { emitirNfse, uploadCertificado, validarCertificado } from './nfse/emitir'
