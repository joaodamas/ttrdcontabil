# Schemas XSD de PRODUÇÃO — Sistema Nacional NFS-e

Pacote oficial `NFSe-ESQUEMAS_XSD-v1.01-20260209`
(https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual), baixado em 2026-11-05.

A pasta `../schemas/` é da **produção restrita** (leiaute da NT 009) e difere da
produção — ex.: `finNFSe` fica direto em `infDPS` só no leiaute de testes; na
produção ele não existe ali e a DPS é recusada com E1235.

Validação local com xmllint: os `pattern` destes XSD começam com `^` e terminam
com `$`, que em XSD são caracteres literais (o servidor .NET da Sefin os trata
como âncoras). Para validar com xmllint, use uma cópia sem `^`/`$`:

    sed -i '' 's/value="\^\([^"]*\)\$"/value="\1"/g' copia/*.xsd
